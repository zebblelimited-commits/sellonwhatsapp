export type CourierCatalogEntry = {
  id: string;
  name: string;
  code: string;
  logo: string;
  estimatedDays: string;
  defaultActive: boolean;
};

/** The complete courier selector managed from the admin settings panel. */
export const COURIER_CATALOG: CourierCatalogEntry[] = [
  {
    id: "chowdeck",
    name: "Chowdeck",
    code: "chowdeck",
    logo: "/images/couriers/chowdecklogo.jpg",
    estimatedDays: "Same Day Delivery",
    defaultActive: true,
  },
  {
    id: "dellyman",
    name: "Dellyman",
    code: "dellyman",
    logo: "/images/couriers/dellymanlogo.jpg",
    estimatedDays: "1-2 Business Days",
    defaultActive: true,
  },
  {
    id: "fez_delivery",
    name: "Fez Delivery",
    code: "fez",
    logo: "/images/couriers/fezlogo.png",
    estimatedDays: "1-3 Business Days",
    defaultActive: true,
  },
  {
    id: "gig_logistics",
    name: "GIG Logistics",
    code: "gig",
    logo: "/images/couriers/gigilogo.jpg",
    estimatedDays: "2-4 Business Days",
    defaultActive: true,
  },
  {
    id: "glovo",
    name: "Glovo",
    code: "glovo",
    logo: "/images/couriers/glovologo.png",
    estimatedDays: "Express Same Day",
    defaultActive: true,
  },
  {
    id: "kwikpik",
    name: "Kwikpik",
    code: "kwikpik",
    logo: "/images/couriers/kwikpik.jpeg",
    estimatedDays: "1-2 Business Days",
    defaultActive: true,
  },
  {
    id: "self_arranged",
    name: "Self-arranged delivery",
    code: "self_arranged",
    logo: "/images/couriers/self-arranged.png",
    estimatedDays: "Seller or buyer handles delivery",
    defaultActive: true,
  },
  {
    id: "sendbox_shipping",
    name: "Sendbox",
    code: "sendbox",
    logo: "/images/couriers/sendboxlogo.jpeg",
    estimatedDays: "2-4 Business Days",
    defaultActive: true,
  },
  {
    id: "topship",
    name: "Topship",
    code: "topship",
    logo: "/images/couriers/topshiplogo.jpeg",
    estimatedDays: "2-4 Business Days",
    defaultActive: true,
  },
];
