import Image from "next/image";
import { cn } from "@ui";

export function TokenMarks({ marks, className }: { marks: readonly string[]; className?: string }) {
  return (
    <div className={cn("flex -space-x-3", className)}>
      {marks.map((mark) => (
        <span
          key={mark}
          className="grid h-11 w-11 overflow-hidden rounded-full border-2 border-[#111820] bg-[#18222b]"
        >
          <Image
            src={`/tokens/${mark}.png`}
            alt={`${mark} token`}
            width={44}
            height={44}
            className="h-full w-full object-cover"
          />
        </span>
      ))}
    </div>
  );
}
