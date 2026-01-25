import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$main/store/request-delivery')({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "Request Delivery",
    }]
  }),
})

function RouteComponent() {
  return <div>Coming soon</div>
}
