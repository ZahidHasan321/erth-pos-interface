-- Replace the `auth-login` Deno Edge Function with an in-database procedure.
--
-- The Edge isolate was dropping ~40% of login requests at cold boot
-- (connection closed before the handler ran — see the comment that used to
-- live in supabase/functions/auth-login/index.ts). This moves the entire
-- login bridge into Postgres:
--
--   1. verify PIN + lockout  (reuses existing public.verify_pin)
--   2. ensure a linked GoTrue auth user, rotate to a fresh one-time password
--   3. return { email, password, user } so the client can exchange it for a
--      session via supabase.auth.signInWithPassword (/auth/v1/token — healthy)
--
-- No Deno isolate in the login critical path anymore.

CREATE OR REPLACE FUNCTION public.login_with_pin(p_username text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $function$
DECLARE
  v_user     jsonb;
  v_user_id  uuid;
  v_email    text;
  v_password text;
  v_auth_id  uuid;
  v_meta     jsonb;
BEGIN
  -- 1. Verify PIN + lockout. Raises on bad PIN / locked / inactive; the
  --    exception propagates to the client exactly as before.
  v_user := public.verify_pin(p_username, p_pin);

  v_user_id  := (v_user->>'id')::uuid;
  v_email    := lower(v_user->>'username') || '@workshop.internal';
  v_password := encode(gen_random_bytes(24), 'hex');

  -- GoTrue reads raw_app_meta_data into the JWT's app_metadata claim. Keep the
  -- provider keys it expects plus the app's own user context.
  v_meta := jsonb_build_object(
    'provider',      'email',
    'providers',     jsonb_build_array('email'),
    'user_id',       v_user_id,
    'role',          v_user->>'role',
    'department',    v_user->>'department',
    'job_functions', COALESCE(v_user->'job_functions', '[]'::jsonb)
  );

  -- 2. Find the linked auth user (by public.users.auth_id, then by email).
  SELECT auth_id INTO v_auth_id FROM public.users WHERE id = v_user_id;
  IF v_auth_id IS NULL THEN
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_email;
  END IF;

  IF v_auth_id IS NULL THEN
    -- 3a. Create the GoTrue user + email identity.
    v_auth_id := gen_random_uuid();
    -- GoTrue scans the token/string columns into non-nullable Go strings, so
    -- they MUST be '' not NULL or sign-in fails with "Database error querying
    -- schema". (Admin-API-created users already have '' here.)
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token,
      reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated',
      'authenticated', v_email, crypt(v_password, gen_salt('bf')),
      now(), v_meta, '{}'::jsonb, now(), now(), false, false,
      '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      created_at, updated_at, last_sign_in_at
    ) VALUES (
      gen_random_uuid(), v_auth_id, v_auth_id::text, 'email',
      jsonb_build_object('sub', v_auth_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  ELSE
    -- 3b. Existing user — rotate password, refresh metadata, ensure confirmed.
    UPDATE auth.users
       SET encrypted_password = crypt(v_password, gen_salt('bf')),
           raw_app_meta_data  = v_meta,
           email              = v_email,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at         = now()
     WHERE id = v_auth_id;

    -- Older accounts (created via the admin API) may lack an email identity.
    IF NOT EXISTS (
      SELECT 1 FROM auth.identities
      WHERE user_id = v_auth_id AND provider = 'email'
    ) THEN
      INSERT INTO auth.identities (
        id, user_id, provider_id, provider, identity_data,
        created_at, updated_at, last_sign_in_at
      ) VALUES (
        gen_random_uuid(), v_auth_id, v_auth_id::text, 'email',
        jsonb_build_object('sub', v_auth_id::text, 'email', v_email, 'email_verified', true),
        now(), now(), now()
      );
    END IF;
  END IF;

  -- 4. Link auth_id back to public.users if needed.
  UPDATE public.users
     SET auth_id = v_auth_id
   WHERE id = v_user_id AND auth_id IS DISTINCT FROM v_auth_id;

  -- 5. Hand the client a one-time credential to exchange for a session.
  RETURN jsonb_build_object(
    'email',    v_email,
    'password', v_password,
    'user', jsonb_build_object(
      'id',            v_user_id,
      'username',      v_user->>'username',
      'name',          v_user->>'name',
      'role',          v_user->>'role',
      'department',    v_user->>'department',
      'job_functions', COALESCE(v_user->'job_functions', '[]'::jsonb),
      'brands',        COALESCE(v_user->'brands', '[]'::jsonb)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.login_with_pin(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;
