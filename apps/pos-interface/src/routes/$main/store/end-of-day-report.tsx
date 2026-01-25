import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$main/store/end-of-day-report')({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "End of Day Report",
    }]
  }),
})

function RouteComponent() {
  return <div>Coming soon</div>
}
