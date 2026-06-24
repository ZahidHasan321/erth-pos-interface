import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { BRAND_NAMES } from '@/lib/constants'
import { ErrorBoundary } from '@/components/global/error-boundary'

export const Route = createFileRoute('/$main/store')({
  beforeLoad: ({ params, context }) => {
    if (params.main === BRAND_NAMES.fromHome) {
      throw redirect({ to: '/$main', params: { main: params.main } })
    }
    // Measurement takers (§5) have no Store Management access (stock, transfers,
    // stocktake, suppliers, reports, EOD). Block direct URL navigation.
    if (context.auth.user?.role === 'measurement_taker') {
      throw redirect({ to: '/$main', params: { main: params.main } })
    }
  },
  component: () => (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  ),
})
