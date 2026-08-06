import Link from "next/link";
import Image from "next/image";

interface Product {
    id: string;
    name: string;
    price: number;
    images?: string[];
    imageUrl?: string;
    image?: string;
    storeName?: string;
    currency?: string;
}

interface ProductCardProps {
    product: Product;
    compact?: boolean;
}

export default function ProductCard({ product, compact = false }: ProductCardProps) {
    const currencySymbol = product.currency === "NGN" ? "₦" : product.currency || "₦";
    const productImage = product.images?.[0] || product.imageUrl || product.image;

    return (
        <Link href={`/products/${product.id}`} className="group block">
            <div className={`bg-white shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300 ${compact ? "rounded-lg" : "rounded-xl"}`}>
                <div className={`relative w-full bg-gray-100 ${compact ? "h-36" : "h-48"}`}>
                    {productImage ? (
                        <Image
                            src={productImage}
                            alt={product.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                            No Image
                        </div>
                    )}
                </div>
                <div className={compact ? "p-2.5" : "p-4"}>
                    <h3 className={`${compact ? "text-sm" : "text-lg"} font-semibold text-gray-900 truncate group-hover:text-green-600 transition-colors`}>
                        {product.name}
                    </h3>
                    {product.storeName && (
                        <p className="text-sm text-gray-500 mt-1 truncate">{product.storeName}</p>
                    )}
                    <p className={`${compact ? "text-base mt-1" : "text-xl mt-2"} font-bold text-green-600`}>
                        {currencySymbol}{product.price?.toLocaleString()}
                    </p>
                </div>
            </div>
        </Link>
    );
}
