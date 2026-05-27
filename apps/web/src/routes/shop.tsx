import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShoppingBag } from "lucide-react";
import type { Bookmark } from "@bookmark/types";
import { fetchShopGroups, type ShopGroup } from "../utils/api";

export const Route = createFileRoute("/shop")({
  component: ShopPage,
});

function ShopPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shop"],
    queryFn: fetchShopGroups,
  });

  const groups = data?.groups ?? [];
  const total = data?.total ?? 0;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-7 w-32 animate-pulse rounded bg-muted/60" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4 px-4">
        <div className="rounded-full bg-muted p-4">
          <ShoppingBag className="size-7 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-medium">No shop products yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Share a link from Myntra, Amazon, Flipkart and similar stores in WhatsApp and
            they'll show up here, auto-grouped by product type.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-lg sm:text-xl font-medium flex items-center gap-2">
          <ShoppingBag className="size-5" />
          Shop
        </h1>
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? "product" : "products"}
        </span>
      </header>

      {groups.map((group) => (
        <CategorySection key={group.category} group={group} />
      ))}
    </div>
  );
}

function CategorySection({ group }: { group: ShopGroup }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-medium capitalize">{group.category}</h2>
        <span className="text-xs text-muted-foreground">({group.count})</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {group.items.map((item) => (
          <ProductCard key={item.id} bookmark={item} />
        ))}
      </div>
    </section>
  );
}

function ProductCard({ bookmark }: { bookmark: Bookmark }) {
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 rounded-md border border-border/40 bg-card p-2 no-underline transition-colors hover:border-border hover:no-underline"
    >
      <div className="aspect-[3/4] overflow-hidden rounded bg-muted/40">
        {bookmark.image ? (
          <img
            src={bookmark.image}
            alt={bookmark.title ?? bookmark.domain}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="size-6" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="line-clamp-2 text-xs sm:text-sm font-medium text-foreground">
          {bookmark.title ?? bookmark.url}
        </p>
        <p className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
          <span className="truncate">{bookmark.domain}</span>
          <ExternalLink className="size-3 shrink-0 opacity-60 group-hover:opacity-100" />
        </p>
      </div>
    </a>
  );
}
