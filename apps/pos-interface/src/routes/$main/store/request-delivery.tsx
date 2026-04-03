import { createFileRoute } from '@tanstack/react-router'
import RequestDeliveryPage from '@/components/store/request-delivery-page'

export const Route = createFileRoute('/$main/store/request-delivery')({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "Request Delivery",
    }]
  }),
})

function RouteComponent() {
  return <RequestDeliveryPage />
}
