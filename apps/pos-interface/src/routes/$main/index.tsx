import { createFileRoute } from "@tanstack/react-router"


export const Route = createFileRoute('/$main/')({
    component: RouteComponent,
    head: () => ({
        meta: [{
            title: "Dashboard",
        }]
    }),
})

function RouteComponent() {
    return <div>Dashboard</div>
}
