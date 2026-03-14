import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcwIcon, SmartphoneIcon } from "lucide-react";

import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { QRDisplay } from "../QRDisplay";
import {
  getWhatsAppQR,
  getWhatsAppStatus,
  reconnectWhatsApp,
} from "../../utils/api";

export function WhatsAppConnectionSettings() {
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
    <Card className="border-border/80 bg-card/80">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <SmartphoneIcon className="text-muted-foreground" />
          <CardTitle>WhatsApp connection</CardTitle>
        </div>
        <CardDescription>
          Link your WhatsApp to let shared links flow straight into your
          bookmark library.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
            {reconnectMutation.isPending ? "Reconnecting\u2026" : "Generate a New QR"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
