import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@bookmark/ui/components/input-group";
import { Kbd } from "@bookmark/ui/components/kbd";

export default function Particle() {
  return (
    <InputGroup>
      <InputGroupInput
        aria-label="Search"
        placeholder="Search…"
        type="search"
      />
      <InputGroupAddon align="inline-end">
        <Kbd>/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
