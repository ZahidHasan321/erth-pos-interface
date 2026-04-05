import { createFileRoute, useNavigate } from "@tanstack/react-router";
import TransferHistoryPage, {
  type HistorySearch,
  type SortKey,
} from "@/components/store/transfer-history-page";

export const Route = createFileRoute("/$main/store/transfer-history")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): HistorySearch => ({
    dir:
      search.dir === "shop_to_workshop" || search.dir === "workshop_to_shop"
        ? search.dir
        : undefined,
    type:
      search.type === "fabric" ||
      search.type === "shelf" ||
      search.type === "accessory"
        ? search.type
        : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    sort:
      search.sort === "date_asc" ||
      search.sort === "id_asc" ||
      search.sort === "id_desc" ||
      search.sort === "date_desc"
        ? (search.sort as SortKey)
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Transfer History" }] }),
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <TransferHistoryPage
      search={search}
      onSearchChange={(patch) =>
        navigate({ search: (prev: HistorySearch) => ({ ...prev, ...patch }) as HistorySearch })
      }
      onClear={() => navigate({ search: {} as HistorySearch })}
    />
  );
}
