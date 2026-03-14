import { useQuery } from "@tanstack/react-query";
import { HashIcon } from "lucide-react";
import { Badge } from "@bookmark/ui/components/badge";
import { fetchTags } from "../utils/api";
import { Button } from "@bookmark/ui/components/button";

interface TagFilterProps {
  selected: string[];
  onChange: (tags: string[]) => void;
}

export function TagFilter({ selected, onChange }: TagFilterProps) {
  const { data: tags = [] } = useQuery({
    queryKey: ["bookmarks", "tags"],
    queryFn: fetchTags,
    staleTime: 60_000,
  });

  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          <HashIcon data-icon="inline-start" />
          Tags
        </Badge>
        {selected.length ? (
          <Button variant="ghost" size="xs" onClick={() => onChange([])}>
            Clear filters
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
      {tags.map(({ tag, count }) => (
        <Button
          key={tag}
          variant={selected.includes(tag) ? "default" : "outline"}
          size="sm"
          onClick={() => toggle(tag)}
        >
          {tag}
          <span className="ml-1 text-xs opacity-60">{count}</span>
        </Button>
      ))}
      </div>
    </div>
  );
}
