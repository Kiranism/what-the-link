import { Badge } from "@bookmark/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { AlertCircleIcon, CheckCircle2Icon, QrCodeIcon } from "lucide-react";

interface QRDisplayProps {
  qr: string | null;
  connected: boolean;
  phoneNumber?: string;
  message?: string;
}

export function QRDisplay({
  qr,
  connected,
  phoneNumber,
  message,
}: QRDisplayProps) {
  if (connected) {
    return (
      <Card className="border-border/80 bg-card/80">
        <CardHeader className="gap-3">
          <Badge className="w-fit">
            <CheckCircle2Icon data-icon="inline-start" />
            Connected
          </Badge>
          <CardTitle>WhatsApp is linked</CardTitle>
          <CardDescription>
            New links shared in the connected account can now land in your
            bookmark library automatically.
          </CardDescription>
        </CardHeader>
        {phoneNumber ? (
          <CardContent>
            <p className="font-medium text-sm">{phoneNumber}</p>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  if (!qr) {
    return (
      <Card className="border-dashed border-border/80 bg-card/70">
        <CardContent className="flex min-h-56 items-center justify-center py-8 text-center">
          <div className="flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
            <AlertCircleIcon aria-hidden="true" />
            <p className="text-sm">{message ?? "Loading QR code\u2026"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 bg-card/80">
      <CardHeader className="gap-3">
        <Badge variant="secondary" className="w-fit">
          <QrCodeIcon data-icon="inline-start" />
          Waiting for scan
        </Badge>
        <CardTitle>Scan to connect WhatsApp</CardTitle>
        <CardDescription>
          Open WhatsApp, go to Linked devices, then scan this code to connect
          your bookmark pipeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <div className="aspect-square border bg-white p-3 shadow-sm">
          <img src={qr} alt="WhatsApp QR code" width={256} height={256} className="size-full object-contain" />
        </div>
      </CardContent>
    </Card>
  );
}
