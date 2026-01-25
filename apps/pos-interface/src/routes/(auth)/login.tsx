import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import sleep, { useAuth } from "@/context/auth";
import { BRAND_NAMES } from "@/lib/constants";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { AlertCircle, LogIn } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ErthLogoDark from "@/assets/erth-dark.svg";
import ErthLogoLight from "@/assets/erth-light.svg";
import SakktbaLogo from "@/assets/Sakkba.png";

const fallback = "/" as const;

export const Route = createFileRoute("/(auth)/login")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || fallback });
    }
  },
  component: LoginComponent,
  head: () => ({
    meta: [
      {
        title: "Login",
      },
    ],
  }),
});

function LoginComponent() {
  const auth = useAuth();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const search = Route.useSearch();

  // Detect userType from redirect if exists
  const initialUserType: (typeof BRAND_NAMES)[keyof typeof BRAND_NAMES] =
    search.redirect?.startsWith(`/${BRAND_NAMES.fromHome}`)
      ? BRAND_NAMES.fromHome
      : search.redirect?.startsWith(`/${BRAND_NAMES.showroom}`)
        ? BRAND_NAMES.showroom
        : BRAND_NAMES.showroom; // default if no redirect

  const [userType, setUserType] =
    React.useState<(typeof BRAND_NAMES)[keyof typeof BRAND_NAMES]>(
      initialUserType,
    );

  const onFormSubmit = async (evt: React.FormEvent<HTMLFormElement>) => {
    setIsSubmitting(true);
    try {
      evt.preventDefault();
      const data = new FormData(evt.currentTarget);
      const identifier = data.get("username")?.toString();
      const password = data.get("password")?.toString();

      if (!identifier || !password) return;

      await auth.login({
        username: identifier,
        password,
        userType,
      });

      await router.invalidate();
      await sleep(1); // hack for auth state update

      // Redirect logic
      if (userType === initialUserType && search.redirect) {
        // User kept the inferred type → follow redirect
        await navigate({ to: search.redirect });
      } else {
        // User changed type OR no redirect → send to type root
        await navigate({ to: `/${userType}` });
      }
    } catch (error) {
      console.error("Error logging in: ", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center p-4">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        <Card
          className={`bg-card shadow-2xl overflow-hidden ${
            userType === BRAND_NAMES.showroom
              ? "border-2 border-green-500/20"
              : "border-2 border-slate-600/20"
          }`}
        >
          {/* Logo Section */}
          <motion.div
            variants={itemVariants}
            className={`px-8 pt-6 pb-6 ${
              userType === BRAND_NAMES.showroom
                ? "bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent"
                : "bg-gradient-to-br from-slate-600/8 via-slate-500/4 to-transparent"
            }`}
          >
            <div className="flex justify-center mb-4">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-background rounded-2xl p-4 shadow-lg w-32 h-24 flex items-center justify-center"
              >
                <img
                  src={
                    userType === BRAND_NAMES.showroom
                      ? ErthLogoLight
                      : SakktbaLogo
                  }
                  alt={
                    userType === BRAND_NAMES.showroom
                      ? "Erth Logo"
                      : "Sakkba Logo"
                  }
                  className="max-w-full max-h-full object-contain"
                />
              </motion.div>
            </div>
            <h1 className="text-3xl font-bold text-center text-foreground mb-2 brand-font">
              {userType === BRAND_NAMES.showroom ? "Erth" : "Sakkba"}
            </h1>
            <p className="text-sm text-center text-muted-foreground">
              Welcome Back
            </p>
          </motion.div>

          {/* Form Section */}
          <div className="p-8 pt-6">
            {search.redirect && (
              <motion.div variants={itemVariants}>
                <Alert
                  className={`mb-6 ${
                    userType === BRAND_NAMES.showroom
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-slate-500/40 bg-slate-500/5"
                  }`}
                >
                  <AlertCircle
                    className={`h-4 w-4 ${
                      userType === BRAND_NAMES.showroom
                        ? "text-green-600"
                        : "text-slate-600"
                    }`}
                  />
                  <AlertDescription className="text-foreground">
                    Please login to continue
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            <form onSubmit={onFormSubmit}>
              <fieldset disabled={isSubmitting} className="space-y-5">
                {/* Username Field */}
                <motion.div variants={itemVariants} className="space-y-2">
                  <Label
                    htmlFor="username-input"
                    className="text-sm font-semibold"
                  >
                    Username or User ID
                  </Label>
                  <Input
                    id="username-input"
                    name="username"
                    placeholder="Enter your username or ID"
                    type="text"
                    className={`bg-background ${
                      userType === BRAND_NAMES.showroom
                        ? "!border-green-500/30 focus:!border-green-500 focus:!ring-green-500/20"
                        : "!border-slate-400/30 focus:!border-slate-600 focus:!ring-slate-500/15"
                    }`}
                    required
                  />
                </motion.div>

                {/* Password Field */}
                <motion.div variants={itemVariants} className="space-y-2">
                  <Label
                    htmlFor="password-input"
                    className="text-sm font-semibold"
                  >
                    Password
                  </Label>
                  <Input
                    id="password-input"
                    name="password"
                    placeholder="Enter your password"
                    type="password"
                    className={`bg-background ${
                      userType === BRAND_NAMES.showroom
                        ? "!border-green-500/30 focus:!border-green-500 focus:!ring-green-500/20"
                        : "!border-slate-400/30 focus:!border-slate-600 focus:!ring-slate-500/15"
                    }`}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Hint: password is 123
                  </p>
                </motion.div>

                {/* Brand Selection */}
                <motion.div variants={itemVariants} className="space-y-3">
                  <Label className="text-sm font-semibold">Select Brand</Label>
                  <Tabs
                    value={userType}
                    onValueChange={(value) =>
                      setUserType(
                        value as (typeof BRAND_NAMES)[keyof typeof BRAND_NAMES],
                      )
                    }
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2 h-auto p-1">
                      <TabsTrigger
                        value={BRAND_NAMES.showroom}
                        className="group flex items-center gap-2 py-3 data-[state=active]:bg-green-950 data-[state=active]:text-white"
                      >
                        <img
                          src={ErthLogoLight}
                          alt="Erth"
                          className="h-5 w-auto group-data-[state=active]:hidden"
                        />
                        <img
                          src={ErthLogoDark}
                          alt="Erth"
                          className="h-5 w-auto hidden group-data-[state=active]:block"
                        />
                        <span className="font-semibold">Erth</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value={BRAND_NAMES.fromHome}
                        className="group flex items-center gap-2 py-3 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                      >
                        <img
                          src={SakktbaLogo}
                          alt="Sakkba"
                          className="h-4 w-auto group-data-[state=active]:brightness-0 group-data-[state=active]:invert"
                        />
                        <span className="font-semibold">Sakkba</span>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </motion.div>

                {/* Submit Button */}
                <motion.div variants={itemVariants} className="pt-2">
                  <Button
                    type="submit"
                    className={`w-full !text-white ${
                      userType === BRAND_NAMES.showroom
                        ? "!bg-green-950 hover:!bg-green-900"
                        : "!bg-slate-800 hover:!bg-slate-700"
                    }`}
                    size="lg"
                    disabled={isSubmitting}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    {isSubmitting ? "Logging in..." : "Login"}
                  </Button>
                </motion.div>
              </fieldset>
            </form>
          </div>
        </Card>

        {/* Footer */}
        <motion.p
          variants={itemVariants}
          className="text-center text-sm text-muted-foreground mt-6"
        >
          Secure tailoring management system
        </motion.p>
      </motion.div>
    </div>
  );
}

