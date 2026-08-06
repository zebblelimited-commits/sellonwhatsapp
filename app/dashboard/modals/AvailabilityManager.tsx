import React, { useState } from 'react';
import { Clock, Save, Calendar } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, Timestamp } from 'firebase/firestore';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BRAND_GREEN = "#00A63E";

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  active: boolean;
  slots: TimeSlot[];
}

interface WeeklySchedule {
  [key: string]: DaySchedule;
}

interface AvailabilityManagerProps {
  productId: string;
  onSaveSuccess?: () => void;
}

const AvailabilityManager: React.FC<AvailabilityManagerProps> = ({ productId, onSaveSuccess }) => {
  const [loading, setLoading] = useState<boolean>(false);
  
  // Default state: 9 AM to 5 PM for all days
  const [schedule, setSchedule] = useState<WeeklySchedule>(
    DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: { active: true, slots: [{ start: "09:00", end: "17:00" }] }
    }), {})
  );

  const toggleDay = (day: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], active: !prev[day].active }
    }));
  };

  const updateSlot = (day: string, index: number, field: keyof TimeSlot, value: string) => {
    const newSlots = [...schedule[day].slots];
    newSlots[index][field] = value;
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], slots: newSlots }
    }));
  };

  const handleSave = async () => {
    if (!productId) {
      alert("Product ID is required to sync availability.");
      return;
    }
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const availabilityRef = collection(db, "products", productId, "availability");

      // Save each day as a document in the sub-collection
      DAYS.forEach((day) => {
        const dayDocRef = doc(availabilityRef, day);
        batch.set(dayDocRef, {
          dayName: day,
          isOpen: schedule[day].active,
          slots: schedule[day].active ? schedule[day].slots : [],
          lastUpdated: Timestamp.now()
        });
      });

      // Update the main product document to mark setup as complete
      const productRef = doc(db, "products", productId);
      batch.update(productRef, { setupComplete: true });

      await batch.commit(); // Atomic operation for all 7 days
      
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error("Firestore Batch Error:", err);
      alert("Failed to sync availability: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-bottom-4 duration-300 rounded-3xl overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/30">
        <div className="p-2 bg-emerald-50 rounded-xl">
          <Calendar size={20} className="text-emerald-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-lg">Booking Availability</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Configure your weekly schedule</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
        {DAYS.map((day) => (
          <div key={day} className={`p-4 rounded-2xl border transition-all ${schedule[day].active ? 'border-emerald-100 bg-emerald-50/20' : 'border-gray-100 bg-gray-50/50'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={schedule[day].active} 
                  onChange={() => toggleDay(day)}
                  className="w-5 h-5 rounded-md border-gray-200 text-emerald-600 focus:ring-emerald-500"
                  style={{ accentColor: BRAND_GREEN }}
                />
                <span className={`text-sm font-bold ${schedule[day].active ? 'text-gray-900' : 'text-gray-400'}`}>{day}</span>
              </label>
              {!schedule[day].active && (
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-tighter">Unavailable</span>
              )}
            </div>

            {schedule[day].active && (
              <div className="flex flex-wrap gap-3 mt-4 animate-in fade-in duration-300">
                {schedule[day].slots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-emerald-50">
                    <Clock size={12} className="text-emerald-500" />
                    <input 
                      type="time" 
                      value={slot.start} 
                      onChange={(e) => updateSlot(day, idx, 'start', e.target.value)}
                      className="text-xs font-bold outline-none bg-transparent text-gray-700"
                    />
                    <span className="text-gray-300 font-light">to</span>
                    <input 
                      type="time" 
                      value={slot.end} 
                      onChange={(e) => updateSlot(day, idx, 'end', e.target.value)}
                      className="text-xs font-bold outline-none bg-transparent text-gray-700"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-6 border-t border-gray-100">
        <button 
          onClick={handleSave} 
          disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:bg-gray-200 transition-all"
          style={{ backgroundColor: BRAND_GREEN }}
        >
          {loading ? "Syncing..." : <><Save size={16}/> Finalize Availability</>}
        </button>
      </div>
    </div>
  );
};

export default AvailabilityManager;