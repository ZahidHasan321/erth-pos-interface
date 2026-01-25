import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$main/store/stock-report')({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "Stock Report",
    }]
  }),
})

function RouteComponent() {
  return <div>Coming soon</div>
}
