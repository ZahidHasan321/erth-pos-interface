import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$main/orders/new-alteration-order')({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "New Alteration Order",
    }]
  }),
})

function RouteComponent() {
  return <div>Coming soon</div>
}
