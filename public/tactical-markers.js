// Original Vector tactical symbols. SVG stays sharp at every display density.
const paths = {
 A: '<path d="m12 2 1.5 7 7 4v2l-7-2 .3 5 2.7 2v1l-4.5-1-4.5 1v-1l2.7-2 .3-5-7 2v-2l7-4z" fill="currentColor" stroke="none"/>',
 S: '<path d="M2 15h20l-4 5H6zM7 15v-4h9v4M10 11V8h3v3M12 8V4m0 2h5"/>',
 SAT: '<g transform="rotate(35 12 12)"><path d="M2 7h5v10H2zM17 7h5v10h-5z" fill="#2679bc"/><rect x="9" y="8" width="6" height="8" rx=".6"/><path d="M2 10h5m-5 4h5m10-4h5m-5 4h5M4.5 7v10m15-10v10M9 12H7m8 0h2M12 8V4m-2 0h4M11 18l-2 3"/></g>',
 C: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M6 8h8v7H6zM14 10l4-2v7l-4-2M10 15v3"/>',
 N: '<path d="M5 3h11l3 3v15H5zM15 3v4h4M8 10h8m-8 4h8m-8 4h5"/>',
 Q: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7zM12 6l5.2 3v6L12 18l-5.2-3V9z"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
 D: '<path d="m12 2 10 10-10 10L2 12zM13 6l-5 7h4l-1 5 5-8h-4z"/>',
 W: '<path d="M6 19a5 5 0 0 1-2-9 7 7 0 0 1 13-3 6 6 0 0 1 2 12c-4 3-6-3-13 0z" fill="#2578bd44" stroke-width=".7"/><path d="M7 16a3 3 0 0 1-1-5 4.8 4.8 0 0 1 9-2 3.7 3.7 0 1 1 2 7c-4 2-5-2-10 0zM9 13a2 2 0 0 1 0-3c4-3 7 3 4 4z" stroke-width=".55"/>',
 T: '<path d="m6 7 6 5-6 5m7-10 6 5-6 5"/>',
 '•': '<circle cx="12" cy="12" r="7"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>'
};
paths.M = paths.A;
Object.assign(paths, {
 B:'<path d="M3 21V9l9-6 9 6v12M8 21v-8h8v8M2 9h20M12 3V1"/>',
 P:'<path d="M5 22V3m0 1h14l-3 5 3 5H5"/>',
 K:'<path d="M12 2v16m-4-12h8M3 13c0 10 18 10 18 0M3 13l-2 3m20-3 2 3"/>',
 X:'<path d="M3 20h18M5 17v-6h3v6m3 0V7h3v10m3 0V3h3v14"/>',
 F:'<path d="m2 8 10-6 10 6zM4 11v8m5-8v8m6-8v8m5-8v8M2 22h20"/>',
 L:'<path d="m3 7 9-5 9 5v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10M7 5l9 5"/>',
 E:'<path d="m14 2-9 12h7l-2 8 9-13h-7z"/>',
 U:'<path d="M3 3v7a9 9 0 0 0 18 0V3M1 3h4m14 0h4M9 13v8m6-8v8"/>',
 V:'<path d="m2 21 7-12 3 4 3-4 7 12zM10 6l-2-4m6 4 2-4M12 5V1"/>',
 R:'<path d="M12 2c1 7 7 7 7 13a7 7 0 1 1-14 0c0-4 3-6 4-9 0 5 4 5 3-4z"/>'
});
paths.Y=paths.X; paths.O=paths.D;
const cache = new Map();
export function tacticalGlyph(glyph, color = '#a8dcf3', selected = false, stale = false) {
 const key = `${glyph}/${color}/${selected}/${stale}`;
 if (cache.has(key)) return cache.get(key);
 const corners = selected ? '<path d="M2 9V2h7m14 7V2h-7M2 16v7h7m14-7v7h-7" stroke="#8af4ff" stroke-width=".8"/>' : '';
 const clock=stale?'<circle cx="24" cy="3" r="3"/><path d="M24 1v2l1 1"/>':'';
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="-4 -4 32 32"><g color="${color}" opacity="${stale ? .48 : 1}" stroke-dasharray="${stale?'2 1':'none'}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${paths[glyph] || paths['•']}${corners}${clock}</g></svg>`;
 const uri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
 cache.set(key, uri); return uri;
}
export function headingBetween(a, b) {
 const rad = Math.PI / 180, delta = (((b.lon-a.lon+540)%360)-180)*rad;
 return Math.atan2(Math.sin(delta)*Math.cos(b.lat*rad), Math.cos(a.lat*rad)*Math.sin(b.lat*rad)-Math.sin(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos(delta));
}

const symbols = new WeakMap();
const activeSymbols=new Set();
export function registerTacticalMarker(entity, glyph, color, timestamp) {
 if(!entity) return;
 let symbol=symbols.get(entity);
 if(!symbol) {symbol={glyph,color,lastState:'',timestamp};symbols.set(entity,symbol);activeSymbols.add(entity);}
 symbol.timestamp=timestamp;
}
export function initTacticalInteraction(viewer) {
 let selected, hovered, lastPick = 0, lastAgeCheck=0, dragging=false, moving=false;
 viewer.camera.moveStart.addEventListener(() => { moving=true; });
 viewer.camera.moveEnd.addEventListener(() => { moving=false; });
 viewer.canvas.addEventListener('pointerdown', () => { dragging=true; });
 window.addEventListener('pointerup', () => { dragging=false; });
 window.addEventListener('pointercancel', () => { dragging=false; });
 window.addEventListener('blur', () => { dragging=false; });
 function paint(entity, state) {
   const symbol = entity && symbols.get(entity);
   if (!symbol || !entity.billboard) return;
   symbol.lastState=state;
   entity.billboard.image=tacticalGlyph(symbol.glyph,symbol.color,state==='selected',symbol.stale);
   if(entity.label) {
     const prominent=state==='selected'||state==='hover';
     entity.label.show=prominent;
     entity.label.showBackground=prominent;
     entity.label.backgroundColor=Cesium.Color.fromCssColorString('#051420').withAlpha(.88);
     entity.label.backgroundPadding=new Cesium.Cartesian2(6,4);
     if(prominent) entity.label.fillColor=Cesium.Color.fromCssColorString('#e4f8ff');
   }
 }
 const handler=new Cesium.ScreenSpaceEventHandler(viewer.canvas);
 handler.setInputAction(event => {
   const picked=viewer.scene.pick(event.position)?.id;
   paint(selected,''); selected=picked; paint(selected,'selected');
 },Cesium.ScreenSpaceEventType.LEFT_CLICK);
 handler.setInputAction(event => {
   if(dragging || moving || event.buttons) return;
   if(performance.now()-lastPick<70) return; lastPick=performance.now();
   const picked=viewer.scene.pick(event.endPosition)?.id;
   if(picked===hovered) return;
   if(hovered!==selected) paint(hovered,'');
   hovered=picked;
   if(hovered!==selected) paint(hovered,'hover');
   viewer.canvas.style.cursor=hovered?.billboard?'pointer':'';
 },Cesium.ScreenSpaceEventType.MOUSE_MOVE);
 viewer.entities.collectionChanged.addEventListener((collection,added,removed) => {
   for(const entity of removed) activeSymbols.delete(entity);
   if(removed.includes(selected)) selected=null;
   if(removed.includes(hovered)) hovered=null;
 });
 viewer.scene.preRender.addEventListener(()=>{
   if(selected?.show && selected.label) selected.label.show=true;
   if(hovered?.show && hovered.label) hovered.label.show=true;
   if(performance.now()-lastAgeCheck<2000)return;lastAgeCheck=performance.now();
   for(const entity of activeSymbols){
     const symbol=symbols.get(entity);
     const observed=typeof symbol.timestamp==='number'?symbol.timestamp:Date.parse(symbol.timestamp);
     const threshold=symbol.glyph==='A'||symbol.glyph==='M'?90000:symbol.glyph==='S'||symbol.glyph==='SAT'?600000:86400000*7;
     const stale=Number.isFinite(observed)&&Date.now()-observed>threshold;
     if(stale!==symbol.stale){symbol.stale=stale;paint(entity,symbol.lastState);}
   }
 });
 return {select(entity){paint(selected,'');selected=entity;paint(selected,'selected');}};
}
