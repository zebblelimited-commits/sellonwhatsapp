import Link from "next/link";
import Image from "next/image";

interface Product {
    id: string;
    name: string;
    price: number;
    imageUrl?: string;
    storeName?: string;
    currency?: string;
}

interface ProductCardProps {
    product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
    const currencySymbol = product.currency === "NGN" ? "₦" : product.currency || "₦";

    return (
        <Link href={`/products/${product.id}`} className="group block">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
                <div className="relative h-48 w-full bg-gray-100">
                    {product.imageUrl ? (
                        <Image
                            src={product.imageUrl}
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
                <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-green-600 transition-colors">
                        {product.name}
                    </h3>
                    {product.storeName && (
                        <p className="text-sm text-gray-500 mt-1 truncate">{product.storeName}</p>
                    )}
                    <p className="text-xl font-bold text-green-600 mt-2">
                        {currencySymbol}{product.price?.toLocaleString()}
                    </p>
                </div>
            </div>
        </Link>
    );
}