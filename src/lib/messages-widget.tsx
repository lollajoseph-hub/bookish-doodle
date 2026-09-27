import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ThreadTarget } from "@/components/request-messages";
import { useMembership } from "@/lib/membership";

interface MessagesWidgetValue {
  openThread: (target: ThreadTarget) => void;
  openGeneral: () => void;
  close: () => void;
  isOpen: boolean;
  selectedTarget: ThreadTarget | null;
  showInbox: () => void;
}

const MessagesWidgetContext = createContext<MessagesWidgetValue | null>(null);

export function MessagesWidgetProvider({ children }: { children: ReactNode }) {
  const { membership } = useMembership();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<ThreadTarget | null>(null);
  const value = useMemo<MessagesWidgetValue>(
    () => ({
      isOpen,
      selectedTarget,
      openThread: (target) => {
        setSelectedTarget(target);
        setIsOpen(true);
      },
      openGeneral: () => {
        setSelectedTarget(membership?.client_id ? { kind: "general", id: membership.client_id } : null);
        setIsOpen(true);
      },
      showInbox: () => {
        setSelectedTarget(null);
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }),
    [isOpen, membership?.client_id, selectedTarget],
  );
  return <MessagesWidgetContext.Provider value={value}>{children}</MessagesWidgetContext.Provider>;
}

export function useMessagesWidget() {
  const value = useContext(MessagesWidgetContext);
  if (!value) throw new Error("useMessagesWidget must be used within MessagesWidgetProvider");
  return value;
}