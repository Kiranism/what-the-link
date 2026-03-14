import { ChevronDownIcon, TrashIcon } from "lucide-react";
import { Button } from "@bookmark/ui/components/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@bookmark/ui/components/collapsible";
import { Frame, FrameHeader, FramePanel } from "@bookmark/ui/components/frame";

export default function Particle() {
  return (
    <Frame className="w-full">
      <Collapsible>
        <FrameHeader className="flex-row items-center justify-between px-2 py-2">
          <CollapsibleTrigger
            className="data-panel-open:[&_svg]:rotate-180"
            render={<Button variant="ghost" />}
          >
            <ChevronDownIcon className="size-4" />
            Section header
          </CollapsibleTrigger>
          <Button aria-label="Delete" size="icon" variant="ghost">
            <TrashIcon />
          </Button>
        </FrameHeader>
        <CollapsiblePanel>
          <FramePanel>
            <h2 className="font-semibold text-sm">Section title</h2>
            <p className="text-muted-foreground text-sm">Section description</p>
          </FramePanel>
        </CollapsiblePanel>
      </Collapsible>
    </Frame>
  );
}
