import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { image: 24, container: "h-6 w-6" },
  md: { image: 32, container: "h-8 w-8" },
  lg: { image: 48, container: "h-12 w-12" },
};

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  const { image, container } = sizes[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative flex-shrink-0", container)}>
        <Image
          src="/logo.png"
          alt="PolyWiz"
          width={image}
          height={image}
          className="object-contain"
          priority
        />
      </div>
      {showText && (
        <span
          className={cn(
            "font-semibold",
            size === "sm" && "text-base",
            size === "md" && "text-xl",
            size === "lg" && "text-2xl"
          )}
        >
          PolyWiz
        </span>
      )}
    </div>
  );
}
