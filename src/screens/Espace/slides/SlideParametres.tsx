import { EspaceSettings } from '../EspaceSettings';

export const SlideParametres = () => {
  return (
    <div className="h-full relative overflow-hidden flex flex-col">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center pointer-events-none"
        style={{ backgroundImage: 'url(/assets/backgrounds/slide_bg_settings.png)' }}
      />
      
      {/* Decorative gradient for readability */}
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] pointer-events-none" />

      <div className="flex-1 relative z-10 flex flex-col min-h-0">
        <EspaceSettings />
      </div>
    </div>
  );
};

export default SlideParametres;
