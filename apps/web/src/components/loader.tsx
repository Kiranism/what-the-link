import { Spinner } from "@bookmark/ui/components/spinner";

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8 text-muted-foreground">
      <Spinner className="size-5" />
    </div>
  );
}
