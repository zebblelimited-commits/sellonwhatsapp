"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { Plus_Jakarta_Sans } from "next/font/google";
import { db } from "@/lib/firebase";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

type HeroSlide = {
  id: string;

  eyebrow: string;

  titleBefore: string;
  highlight: string;
  titleAfter: string;

  description: string;

  backgroundImageUrl: string;
  imageUrl: string;

  eyebrowColor: string;
  titleColor: string;
  highlightColor: string;
  descriptionColor: string;
  primaryButtonTextColor: string;
  featureTextColor: string;

  primaryLabel: string;
  primaryUrl: string;

  isActive: boolean;
  sortOrder: number;
};

/**
 * ------------------------------------------------------------
 * FALLBACK SLIDES
 * ------------------------------------------------------------
 */

const fallbackSlides: HeroSlide[] = [
  {
    id: "fallback-1",

    eyebrow: "Everything you need to grow",

    titleBefore: "Turn",
    highlight: "WhatsApp",
    titleAfter: "into your business engine",

    description:
      "Manage products, orders, and customers directly from your phone.",

    backgroundImageUrl: "/images/hero/sellon-hero-bg.webp",
    imageUrl: "/images/hero/sellon-hero-phone.webp",

    eyebrowColor: "#39e878",
    titleColor: "#ffffff",
    highlightColor: "#00d95f",
    descriptionColor: "#d7fbe4",
    primaryButtonTextColor: "#00a63e",
    featureTextColor: "#6b7280",

    primaryLabel: "Start Selling on WhatsApp",
    primaryUrl: "/register",

    isActive: true,
    sortOrder: 1,
  },

  {
    id: "fallback-2",

    eyebrow: "Everything you need to grow",

    titleBefore: "Sell",
    highlight: "smarter",
    titleAfter: "with WhatsApp",

    description:
      "Create your mini storefront, showcase your products and start receiving orders instantly.",

    backgroundImageUrl: "/images/hero/sellon-hero-bg.webp",
    imageUrl: "/images/hero/sellon-hero-phone.webp",

    eyebrowColor: "#39e878",
    titleColor: "#ffffff",
    highlightColor: "#00d95f",
    descriptionColor: "#d7fbe4",
    primaryButtonTextColor: "#00a63e",
    featureTextColor: "#6b7280",

    primaryLabel: "Start Selling on WhatsApp",
    primaryUrl: "/register",

    isActive: true,
    sortOrder: 2,
  },

  {
    id: "fallback-3",

    eyebrow: "Your business is ready",

    titleBefore: "Turn conversations",
    highlight: "into sales",

    titleAfter: "",

    description:
      "Give your customers a simple way to discover your products and buy directly from WhatsApp.",

    backgroundImageUrl: "/images/hero/sellon-hero-bg.webp",
    imageUrl: "/images/hero/sellon-hero-phone.webp",

    eyebrowColor: "#39e878",
    titleColor: "#ffffff",
    highlightColor: "#00d95f",
    descriptionColor: "#d7fbe4",
    primaryButtonTextColor: "#00a63e",
    featureTextColor: "#6b7280",

    primaryLabel: "Create Your Store",
    primaryUrl: "/register",

    isActive: true,
    sortOrder: 3,
  },
];

/**
 * ------------------------------------------------------------
 * HERO FEATURES
 * ------------------------------------------------------------
 */

const features = [
  {
    icon: "/icons/globe.svg",
    text: "No website needed",
  },
  {
    icon: "/icons/flash.svg",
    text: "Instant payments",
  },
  {
    icon: "/icons/mobilephone.svg",
    text: "Mobile optimized",
  },
  {
    icon: "/icons/headphones.svg",
    text: "24/7 support",
  },
];

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

/**
 * ------------------------------------------------------------
 * WHATSAPP ICON
 * ------------------------------------------------------------
 */

function WhatsAppIcon({
  size = 22,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 1.768.46 3.43 1.265 4.874L2 22l5.273-1.245A9.96 9.96 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M8.17 7.91c.2-.44.42-.45.77-.46h.56c.18 0 .39.07.5.37l.75 1.82c.09.22.06.4-.07.58l-.43.58c-.14.18-.28.3-.12.58.16.29.7 1.15 1.5 1.86.9.8 1.66 1.05 1.95 1.18.29.13.46.11.63-.08l.74-.87c.18-.2.36-.17.6-.1l1.76.84c.24.11.4.17.46.27.06.1.06.58-.14 1.13-.2.55-1.02 1.02-1.41 1.08-.36.06-.82.09-1.33-.07-.31-.1-.71-.23-1.22-.45-.51-.22-1.12-.52-1.78-.97-1.16-.8-2.03-1.79-2.65-2.62-.62-.83-1.02-1.56-1.2-1.95-.18-.39-.58-1.4-.57-2.04.01-.63.3-.96.5-1.18Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * ------------------------------------------------------------
 * NORMALIZE FIREBASE SLIDE
 * ------------------------------------------------------------
 */

function normalizeSlide(
  id: string,
  data: Record<string, unknown>,
): HeroSlide {
  return {
    id,

    eyebrow:
      typeof data.eyebrow === "string"
        ? data.eyebrow
        : fallbackSlides[0].eyebrow,

    titleBefore:
      typeof data.titleBefore === "string"
        ? data.titleBefore
        : fallbackSlides[0].titleBefore,

    highlight:
      typeof data.highlight === "string"
        ? data.highlight
        : fallbackSlides[0].highlight,

    titleAfter:
      typeof data.titleAfter === "string"
        ? data.titleAfter
        : fallbackSlides[0].titleAfter,

    description:
      typeof data.description === "string"
        ? data.description
        : fallbackSlides[0].description,

    backgroundImageUrl:
      typeof data.backgroundImageUrl === "string" && data.backgroundImageUrl.length > 0
        ? data.backgroundImageUrl
        : fallbackSlides[0].backgroundImageUrl,

    imageUrl:
      typeof data.imageUrl === "string" ? data.imageUrl.trim() : "",

    eyebrowColor:
      normalizeColor(data.eyebrowColor, fallbackSlides[0].eyebrowColor),

    titleColor:
      normalizeColor(data.titleColor, fallbackSlides[0].titleColor),

    highlightColor:
      normalizeColor(data.highlightColor, fallbackSlides[0].highlightColor),

    descriptionColor:
      normalizeColor(data.descriptionColor, fallbackSlides[0].descriptionColor),

    primaryButtonTextColor:
      normalizeColor(data.primaryButtonTextColor, fallbackSlides[0].primaryButtonTextColor),

    featureTextColor:
      normalizeColor(data.featureTextColor, fallbackSlides[0].featureTextColor),

    primaryLabel:
      typeof data.primaryLabel === "string"
        ? data.primaryLabel
        : "Start Selling on WhatsApp",

    primaryUrl:
      typeof data.primaryUrl === "string"
        ? data.primaryUrl
        : "/register",

    isActive: data.isActive !== false,

    sortOrder: Number.isFinite(Number(data.sortOrder))
      ? Number(data.sortOrder)
      : 0,
  };
}

/**
 * ============================================================
 * HERO COMPONENT
 * ============================================================
 */

export default function Hero() {
  const [slides, setSlides] = useState<HeroSlide[]>(fallbackSlides);

  const [slideIndex, setSlideIndex] = useState(0);

  const [isPaused, setIsPaused] = useState(false);

  /**
   * ----------------------------------------------------------
   * LOAD HERO SLIDES FROM FIREBASE
   * ----------------------------------------------------------
   */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "hero_slides"),

      (snapshot) => {
        const activeSlides = snapshot.docs
          .map((item) => normalizeSlide(item.id, item.data()))
          .filter((slide) => slide.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        setSlides(snapshot.empty ? fallbackSlides : activeSlides);
        setSlideIndex(0);
      },

      (error) => {
        console.warn(
          "Homepage hero slides could not be loaded; using fallback content.",
          error,
        );
      },
    );

    return () => unsubscribe();
  }, []);

  /**
   * ----------------------------------------------------------
   * AUTO SLIDER
   * ----------------------------------------------------------
   */

  useEffect(() => {
    if (slides.length <= 1 || isPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [slides.length, isPaused]);

  /**
   * ----------------------------------------------------------
   * ACTIVE SLIDE
   * ----------------------------------------------------------
   */

  const activeSlideIndex =
    slides.length > 0 ? slideIndex % slides.length : 0;

  const slide = slides[activeSlideIndex];

  if (!slide) {
    return null;
  }

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <section
      className={`${jakarta.className} mx-auto w-full max-w-[1800px] px-3 pt-3 sm:px-4 sm:pt-5 lg:px-5`}
    >
      <div
        className="
          relative
          w-full
          overflow-hidden
          rounded-[22px]
          sm:rounded-[28px]
          lg:rounded-[32px]
        "
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* ====================================================
            GREEN BACKGROUND IMAGE
        ==================================================== */}

        <div
          className="
            absolute
            inset-0
            bg-cover
            bg-center
            bg-no-repeat
          "
          style={{
            backgroundImage: `url("${slide.backgroundImageUrl.replace(/['"\\]/g, "\\$&")}")`,
          }}
        />

        {/* ====================================================
            VERY SUBTLE OVERLAY
        ==================================================== */}

        <div className="absolute inset-0 bg-[#003d20]/10" />

        {/* ====================================================
            HERO MAIN CONTENT

            IMPORTANT:
            We keep the two-column composition on mobile,
            but scale everything down.
        ==================================================== */}

        <div
          className="
            relative
            z-10
            grid
            min-h-[320px]
            grid-cols-[52%_48%]
            sm:min-h-[400px]
            md:min-h-[480px]
            lg:min-h-[590px]
            lg:grid-cols-[46%_54%]
          "
        >
          {/* ==================================================
              LEFT SIDE — TEXT
          ================================================== */}

          <div
            className="
              flex
              min-w-0
              flex-col
              justify-center
              px-4
              py-8
              sm:px-7
              sm:py-10
              md:px-10
              md:py-12
              lg:px-14
              lg:py-14
              xl:px-20
            "
          >
            {/* EYEBROW */}

            <div
              className="
                mb-3
                w-fit
                rounded-full
                border
                border-[#00d95f]/30
                bg-[#00d95f]/15
                px-2.5
                py-1.5
                sm:mb-4
                sm:px-3
                sm:py-2
                md:px-4
              "
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className="text-[9px] sm:text-xs"
                  style={{ color: slide.eyebrowColor }}
                >
                  ✦
                </span>

                <span
                  className="text-[7px] font-bold tracking-wide sm:text-[9px] md:text-xs"
                  style={{ color: slide.eyebrowColor }}
                >
                  {slide.eyebrow}
                </span>
              </div>
            </div>

            {/* HEADING */}

            <h1
              className="
                max-w-[620px]
                text-[23px]
                font-extrabold
                leading-[1.03]
                tracking-[-0.045em]
                sm:text-[32px]

                md:text-[42px]

                lg:text-[55px]

                xl:text-[64px]
              "
              style={{ color: slide.titleColor }}
            >
              {slide.titleBefore}{" "}

              <span style={{ color: slide.highlightColor }}>
                {slide.highlight}
              </span>{" "}

              {slide.titleAfter}
            </h1>

            {/* DESCRIPTION */}

            <p
              className="
                mt-3
                max-w-[500px]
                text-[8px]
                font-medium
                leading-[1.55]
                sm:mt-4
                sm:text-[11px]

                md:text-[13px]

                lg:mt-5
                lg:text-[16px]
                lg:leading-[1.7]
              "
              style={{ color: slide.descriptionColor }}
            >
              {slide.description}
            </p>

            {/* =================================================
                SINGLE CTA BUTTON
            ================================================= */}

            <div className="mt-4 sm:mt-5 md:mt-6 lg:mt-7">
              <Link
                href={slide.primaryUrl}
                className="
                  inline-flex
                  items-center
                  justify-center
                  gap-1.5
                  rounded-lg
                  bg-white
                  px-3
                  py-2
                  text-[8px]
                  font-bold
                  text-[#00a63e]
                  shadow-[0_8px_25px_rgba(0,0,0,0.15)]
                  transition-all
                  duration-200

                  hover:-translate-y-0.5
                  hover:bg-[#f7fff9]

                  sm:gap-2
                  sm:rounded-xl
                  sm:px-4
                  sm:py-2.5
                  sm:text-[10px]

                  md:px-5
                  md:py-3

                  lg:px-6
                  lg:py-3.5
                  lg:text-sm

                  xl:px-7
                  xl:py-4
                "
                style={{ color: slide.primaryButtonTextColor }}
              >
                <WhatsAppIcon
                  size={14}
                  className="shrink-0 sm:h-[17px] sm:w-[17px] lg:h-[22px] lg:w-[22px]"
                />

                <span className="whitespace-nowrap">
                  {slide.primaryLabel}
                </span>
              </Link>
            </div>
          </div>

          {/* ==================================================
              RIGHT SIDE — PHONE / PRODUCT IMAGE
          ================================================== */}

          <div
            className="
              relative
              flex
              min-h-0
              min-w-0
              items-center
              justify-center
              overflow-visible
              px-0
            "
          >
            {/* Decorative green glow */}

            <div
              className="
                absolute
                right-[5%]
                top-[15%]
                h-[120px]
                w-[120px]
                rounded-full
                bg-[#00d95f]/10
                blur-[45px]

                sm:h-[180px]
                sm:w-[180px]
                sm:blur-[60px]

                md:h-[240px]
                md:w-[240px]
                md:blur-[75px]

                lg:h-[300px]
                lg:w-[300px]
                lg:blur-[90px]
              "
            />

            {/* =================================================
                MAIN HERO PHONE IMAGE

                This image already contains:
                - Phone
                - New Order
                - Payment Received
                - Order Shipped
                - Plant
                - Platform
            ================================================= */}

            {slide.imageUrl && (
              <div
                className="
                  relative
                  z-10
                  w-[190%]
                  max-w-none
                  translate-x-[-4%]

                  sm:w-[120%]
                  sm:translate-x-[-1%]

                  md:w-[115%]

                  lg:w-[108%]
                  lg:translate-x-[2%]

                  xl:w-[105%]
                "
              >
                <Image
                  src={slide.imageUrl}
                  alt="SellOn WhatsApp store"
                  width={1000}
                  height={800}
                  priority={activeSlideIndex === 0}
                  className="
                    h-auto
                    w-full
                    object-contain
                    drop-shadow-[0_20px_35px_rgba(0,0,0,0.25)]
                    sm:drop-shadow-[0_25px_40px_rgba(0,0,0,0.28)]
                  "
                />
              </div>
            )}
          </div>
        </div>

        {/* ====================================================
            SLIDER DOTS
        ==================================================== */}

        {slides.length > 1 && (
          <div
            className="
              absolute
              bottom-3
              left-1/2
              z-30
              flex
              -translate-x-1/2
              items-center
              gap-1.5

              sm:bottom-5
              sm:gap-2

              lg:bottom-7
            "
            aria-label="Hero slides"
          >
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSlideIndex(index)}
                aria-label={`Show hero slide ${index + 1}`}
                aria-current={
                  index === activeSlideIndex
                    ? "true"
                    : undefined
                }
                className={`
                  h-1.5
                  rounded-full
                  transition-all
                  duration-300

                  ${index === activeSlideIndex
                    ? "w-6 bg-[#00d95f] sm:w-8"
                    : "w-1.5 bg-white/45 hover:bg-white/70"
                  }
                `}
              />
            ))}
          </div>
        )}

        {/* ====================================================
            DESKTOP PREVIOUS ARROW
        ==================================================== */}

        {slides.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setSlideIndex(
                (activeSlideIndex - 1 + slides.length) %
                slides.length,
              )
            }
            aria-label="Previous slide"
            className="
              absolute
              left-3
              top-1/2
              z-30
              hidden
              h-9
              w-9
              -translate-y-1/2
              items-center
              justify-center
              rounded-full
              bg-black/15
              text-xl
              text-white
              backdrop-blur-md
              transition
              hover:bg-black/25

              sm:flex

              lg:left-5
              lg:h-10
              lg:w-10
            "
          >
            ‹
          </button>
        )}

        {/* ====================================================
            DESKTOP NEXT ARROW
        ==================================================== */}

        {slides.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setSlideIndex(
                (activeSlideIndex + 1) % slides.length,
              )
            }
            aria-label="Next slide"
            className="
              absolute
              right-3
              top-1/2
              z-30
              hidden
              h-9
              w-9
              -translate-y-1/2
              items-center
              justify-center
              rounded-full
              bg-black/15
              text-xl
              text-white
              backdrop-blur-md
              transition
              hover:bg-black/25

              sm:flex

              lg:right-5
              lg:h-10
              lg:w-10
            "
          >
            ›
          </button>
        )}
      </div>

      {/* ======================================================
          FOUR FEATURE POINTS
      ====================================================== */}

      <div
        className="
          mx-auto
          flex
          w-full
          max-w-[1200px]
          items-center
          justify-between
          gap-1.5
          px-1
          py-5

          sm:gap-4
          sm:px-5
          sm:py-7

          lg:px-8
          lg:py-8
        "
      >
        {features.map((item) => (
          <div
            key={item.text}
            className="
              flex
              min-w-0
              flex-1
              flex-col
              items-center
              justify-center
              gap-1
              text-center

              sm:flex-row
              sm:gap-2.5
              sm:text-left
            "
          >
            {/* ICON CIRCLE */}

            <div
              className="
                flex
                h-7
                w-7
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-[#effaf3]

                sm:h-9
                sm:w-9

                md:h-10
                md:w-10
              "
            >
              <Image
                src={item.icon}
                width={17}
                height={17}
                alt=""
                className="h-3.5 w-3.5 object-contain sm:h-4 sm:w-4"
                style={{
                  filter:
                    "invert(41%) sepia(98%) saturate(1450%) hue-rotate(118deg) brightness(95%) contrast(101%)",
                }}
              />
            </div>

            {/* FEATURE TEXT */}

            <span
              className="
                block
                text-[8.5px]
                font-bold
                leading-tight

                xs:text-[9.5px]
                sm:text-[10px]

                md:text-xs
              "
              style={{ color: slide.featureTextColor }}
            >
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
