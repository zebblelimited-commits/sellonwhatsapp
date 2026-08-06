export function KPICard({ icon: Icon, label, value, trend, trendIcon: TrendIcon, trendColor }: {
  icon: any;
  label: string;
  value: string;
  trend: string;
  trendIcon?: any;
  trendColor?: string;
}) {
  return (
    <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-gray-50 rounded-xl">
          <Icon size={20} className="text-gray-400" />
        </div>
        {TrendIcon && (
          <span className={`text-[10px] font-bold flex items-center gap-1 ${trendColor || 'text-gray-400'}`}>
            <TrendIcon size={12} /> {trend}
          </span>
        )}
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
    </div>
  );
}