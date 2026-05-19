import { useEffect, useState } from "react";

// Standard debounce for search inputs. 250ms is the sweet spot for
// "feels instant" without flooding the network.
export const useDebounce = <T,>(value: T, delay = 250): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};
