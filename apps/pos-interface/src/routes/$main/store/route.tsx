import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { BRAND_NAMES } from '@/lib/constants'
import { ErrorBoundary } from '@/components/global/error-boundary'

export const Route = createFileRoute('/$main/store')({
  beforeLoad: ({ params }) => {
    if (params.main === BRAND_NAMES.fromHome) {
      throw redirect({ to: '/$main', params: { main: params.main } })
    }
  },
  component: () => (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  ),
})
