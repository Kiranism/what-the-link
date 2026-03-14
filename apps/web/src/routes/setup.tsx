import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCcwIcon, SmartphoneIcon } from "lucide-react";

import { Badge } from "@bookmark/ui/components/badge";
import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { QRDisplay } from "../components/QRDisplay";
import {
  getWhatsAppQR,
  getWhatsAppStatus,
  reconnectWhatsApp,
} from "../utils/api";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["whatsapp", "status"],
    queryFn: getWhatsAppStatus,
    refetchInterval: 5000,
  });
  const { data: qrData } = useQuery({
    queryKey: ["whatsapp", "qr"],
    queryFn: getWhatsAppQR,
    refetchInterval: status?.connected ? false : 3000,
    enabled: !status?.connected,
  });
  const reconnectMutation = useMutation({
    mutationFn: reconnectWhatsApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp"] });
    },
  });

  const connected = status?.connected ?? qrData?.connected ?? false;
  const phoneNumber = status?.phoneNumber ?? qrData?.phoneNumber;
  const showReconnect = status?.lastDisconnectCode === 440;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Card className="border-border/80 bg-card/85 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="secondary" className="w-fit">
            <SmartphoneIcon data-icon="inline-start" />
            WhatsApp bridge
          </Badge>
          <CardTitle className="text-3xl tracking-tight">
            Connect your WhatsApp session
          </CardTitle>
          <CardDescription className="max-w-2xl">
            Once connected, shared links can flow straight into your bookmark
            library without any manual copy and paste.
          </CardDescription>
        </CardHeader>
      </Card>

      <QRDisplay
        qr={qrData?.qr ?? null}
        connected={connected}
        phoneNumber={phoneNumber}
        message={qrData?.message}
      />

      {showReconnect ? (
        <Button
          variant="outline"
          size="lg"
          className="self-start"
          onClick={() => reconnectMutation.mutate()}
          disabled={reconnectMutation.isPending}
        >
          <RefreshCcwIcon data-icon="inline-start" />
          {reconnectMutation.isPending ? "Reconnecting..." : "Generate a new QR"}
        </Button>
      ) : null}
    </div>
  );
}
