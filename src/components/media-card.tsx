import { Card } from "@heroui/react";
import type { ComponentProps } from "react";

// Keep the shadow outside the clip; composite all image/overlay children before
// applying the shared rounded edge, including at fractional pixel positions.
export function MediaCard({ children, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card {...props}>
      <div className="media-card-clip">{children}</div>
    </Card>
  );
}
