import Image from "next/image";
import {
  Bike,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Package,
  PackageCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { COURIER_CATALOG } from "@/lib/courier-catalog";

type LogoSize = "sm" | "md" | "lg";

const logoSizes: Record<LogoSize, string> = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

const journeyStages: Array<{ key: string; label: string; description: string; icon: LucideIcon }> = [
  { key: "ordered", label: "Order placed", description: "Your order has been received", icon: Package },
  { key: "secured", label: "Payment secured", description: "Payment is held safely for fulfilment", icon: CheckCircle2 },
  { key: "pickup", label: "Courier pickup", description: "The courier is collecting the package", icon: Warehouse },
  { key: "transit", label: "In transit", description: "Your package is on the way", icon: Truck },
  { key: "out_for_delivery", label: "Out for delivery", description: "The rider is heading to the destination", icon: Bike },
  { key: "delivered", label: "Delivered", description: "Package delivered successfully", icon: Check },
];

const statusToStage: Record<string, number> = {
  pending_payment: 0,
  paid_held: 1,
  pending_pickup: 2,
  awaiting_pickup: 2,
  preparing: 2,
  shipped: 3,
  in_transit: 3,
  out_for_delivery: 4,
  completed: 5,
  delivered: 5,
  self_arranged: 2,
};

function normalize(value?: string) {
  return String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function courierEntry(courierId?: string, courierName?: string) {
  const id = normalize(courierId);
  const name = normalize(courierName);
  return COURIER_CATALOG.find((courier) =>
    [courier.id, courier.code, courier.name].some((value) => normalize(value) === id || normalize(value) === name),
  );
}

export function CourierLogo({ courierId, courierName, size = "md" }: { courierId?: string; courierName?: string; size?: LogoSize }) {
  const courier = courierEntry(courierId, courierName);
  return (
    <div className={`relative flex ${logoSizes[size]} shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white p-1 shadow-sm`} title={courierName || courier?.name || "Courier"}>
      {courier?.logo ? <Image src={courier.logo} alt={`${courier.name} logo`} fill sizes="64px" className="object-contain p-1.5" /> : <Truck size={size === "lg" ? 24 : 18} className="text-slate-400" />}
    </div>
  );
}

export function ShipmentJourney({ status, courierName, courierId, createdAt }: { status?: string; courierName?: string; courierId?: string; createdAt?: Date }) {
  const normalizedStatus = normalize(status);
  const cancelled = ["cancelled", "canceled", "rejected"].includes(normalizedStatus);
  const currentStage = statusToStage[normalizedStatus] ?? 0;
  const isSelfArranged = normalizedStatus === "self_arranged";
  const currentLabel = cancelled ? "Delivery cancelled" : isSelfArranged ? "Seller-arranged delivery" : journeyStages[currentStage]?.label || "Order placed";

  return (
    <section className="rounded-3xl border border-slate-100 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-4 sm:p-5" aria-label="Shipment journey">
      <div className="mb-5 flex items-center gap-3">
        <CourierLogo courierId={courierId} courierName={courierName} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Delivery journey</p>
          <p className="mt-1 truncate text-sm font-black text-slate-900">{courierName || "Courier assignment pending"}</p>
        </div>
        <span className={`hidden rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide sm:inline-flex ${cancelled ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          {currentLabel}
        </span>
      </div>

      {cancelled ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm font-bold text-rose-700">
          <CircleDot size={18} /> This delivery was cancelled before completion.
        </div>
      ) : (
        <div className="space-y-1">
          {journeyStages.map((stage, index) => {
            const Icon = stage.icon;
            const complete = index < currentStage;
            const current = index === currentStage;
            return (
              <div key={stage.key} className="relative flex min-h-[58px] gap-3 last:min-h-0">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${complete ? "border-emerald-500 bg-emerald-500 text-white" : current ? "border-indigo-500 bg-indigo-500 text-white shadow-lg shadow-indigo-200" : "border-slate-200 bg-white text-slate-300"}`}>
                    <Icon size={14} />
                  </div>
                  {index < journeyStages.length - 1 && <div className={`w-0.5 flex-1 ${complete ? "bg-emerald-300" : "bg-slate-200"}`} />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-xs font-black ${complete || current ? "text-slate-900" : "text-slate-400"}`}>{stage.label}</p>
                    {current && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-indigo-700">Current</span>}
                  </div>
                  <p className={`mt-0.5 text-[11px] font-medium ${complete || current ? "text-slate-500" : "text-slate-300"}`}>{stage.description}</p>
                  {index === 0 && createdAt && <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-slate-400"><Clock3 size={11} /> {createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function StatusIcon({ status }: { status?: string }) {
  const normalizedStatus = normalize(status);
  const stage = statusToStage[normalizedStatus] ?? 0;
  const Icon = journeyStages[stage]?.icon || PackageCheck;
  return <Icon size={18} />;
}
