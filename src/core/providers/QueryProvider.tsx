import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// Production-grade defaults:
// - staleTime 30s: avoid refetch-on-mount thrash during page navigation
// - gcTime 5m: keep recently-used queries warm
// - retry 1: most Supabase errors are deterministic (RLS / 4xx); don't waste latency
// - refetchOnWindowFocus disabled: an ERP user clicks back to the tab constantly
// - mutations: never retry by default (destructive ops should fail loudly)
const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });

export const QueryProvider = ({ children }: { children: ReactNode }) => {
  // useState ensures one client per app instance (and survives HMR)
  const [client] = useState(createClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
