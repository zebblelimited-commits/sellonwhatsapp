import Image from "next/image";

type PlatformLogoProps = {
  className?: string;
  priority?: boolean;
};

/** The platform wordmark; seller/store logos must use their own image fields. */
export default function PlatformLogo({ className, priority = false }: PlatformLogoProps) {
  return (
    <Image
      src="/icons/sowa.png"
      alt="Sowa Logo"
      width={698}
      height={288}
      quality={100}
      unoptimized
      priority={priority}
      className={className}
    />
  );
}
