import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import type { ActionError } from "~/lib/api";

// Posts { intent: "close" } to the /sessions route's clientAction, from any page
export function CloseSessionButton({ id }: { id: string }) {
  const fetcher = useFetcher<{ ok: true; message: string } | ActionError>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) toast.success(fetcher.data.message);
      else toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" action="/sessions">
      <input type="hidden" name="intent" value="close" />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy && <Loader2Icon className="animate-spin" />}
        Close
      </Button>
    </fetcher.Form>
  );
}
