const $ = id => document.getElementById(id);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#${name}"></use></svg>`;
const samples = new Map();
const marketSamples = new Map();
let lastSample = 0;
let marketSort="default";
let lastMarkets=[];
let sparkId=0;
const categoryKeys = ['geopolitical','finance','infrastructure','environmental'];
const categoryFields = ['geopoliticsScore','volatilityScore','stressScore','climateRiskScore'];
const categoryNames = ['Geopolitical','Finance','Infrastructure','Environmental'];
const categoryIcons = ['globe','finance','building','leaf'];
const number = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
const colorForRisk = value => value > 75 ? '#ff4e61' : value > 50 ? '#ff9760' : value > 25 ? '#ffd04f' : '#4de7b2';

export function sparkline(values, color = '#51deb2') {
  const points = values.filter(value => Number.isFinite(value));
  if (!points.length) return '';
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const path = points.map((value,index) => `${index ? 'L' : 'M'}${(index / Math.max(1,points.length-1)*100).toFixed(2)},${(18-(value-min)/range*15).toFixed(2)}`).join(' ');
  // One sample is represented by a point, never by an invented trend.
  const id=`vector-spark-${++sparkId}`;
  return `<svg class="trend-svg" viewBox="0 0 100 22" preserveAspectRatio="none" role="img" aria-label="Observed trend"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${points.length>1?`<path d="${path} L100,22 L0,22 Z" fill="url(#${id})"/>`:''}<path d="${path}" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${points.length === 1 ? `<circle cx="0" cy="18" r="1.4" fill="${color}"/>` : ''}</svg>`;
}

export function renderPrecision({summary,history,snapshot,totals,localScores,scope}) {
  const risk = number(summary?.score?.compositeRisk);
  const posture = summary?.score?.posture || 'Awaiting data';
  const power = number(summary?.categories?.infrastructure?.stressScore);
  $('riskRingValue').textContent = risk === null ? '—' : Math.round(risk);
  $('riskRing').style.setProperty('--risk-angle', `${(risk || 0)*3.6}deg`);
  $('riskRing').style.background = `conic-gradient(${colorForRisk(risk || 0)} ${(risk || 0)*3.6}deg,#526268aa 0deg)`;
  $('kpiComposite').textContent = posture.charAt(0).toUpperCase()+posture.slice(1);
  $('kpiComposite').style.color = colorForRisk(risk || 0);
  $('kpiFlights').textContent = Number(totals.aircraft || snapshot.aircraft.length || 0).toLocaleString();
  $('kpiSatellites').textContent = Number(totals.satellites || snapshot.satellites.length || 0).toLocaleString();
  $('kpiCyber').textContent = Number(snapshot.cyber.length || 0).toLocaleString();
  $('kpiPower').textContent = power === null ? '—' : `${Math.round(power)}%`;
  const kpis = [risk,totals.aircraft || snapshot.aircraft.length,totals.satellites || snapshot.satellites.length,snapshot.cyber.length,power];
  const loaded=[risk!==null,snapshot.aircraft.length>0,snapshot.satellites.length>0,snapshot.cyber.length>0,power!==null];
  if (Date.now()-lastSample>5000) {
    kpis.forEach((value,index) => {
      if (value === null || !loaded[index]) return;
      const list = samples.get(index) || [];list.push(Number(value));samples.set(index,list.slice(-90));
    });
    for (const market of snapshot.financeMarkets || []) {
      if (!Number.isFinite(Number(market.currentPrice))) continue;
      const key = market.id || market.symbol;
      const list=marketSamples.get(key) || [];list.push(Number(market.currentPrice));marketSamples.set(key,list.slice(-90));
    }
    lastSample=Date.now();
  }
  kpis.forEach((value,index) => {
    const list=samples.get(index) || [];
    const change=list.length>1 && list[0] ? (list.at(-1)-list[0])/list[0]*100 : null;
    const rising=change!==null && change>0;
    const bad = [0,3,4].includes(index) ? rising : !rising;
    const el=$(`kpiChange${index}`);
    el.textContent=change===null ? '—' : `${rising?'▲':change<0?'▼':'•'} ${Math.abs(change).toFixed(1)}%`;
    el.style.color=bad && change!==0?'#ff5364':'#48dfb1';
    $(`kpiSpark${index}`).innerHTML=sparkline(index===0 && history?.length ? history.slice(-30).map(p=>Number(p.compositeRisk)) : list,bad?'#ff5364':'#48dfb1');
  });
  renderCategoryRows(summary,history,localScores);
  for (const select of document.querySelectorAll('[data-scope-select]')) select.value=scope?'local':'global';
  renderMarkets(snapshot.financeMarkets || []);
  $('cameraShortcutCount').textContent = `${snapshot.cctv?.length || 0} cams`;
}

function renderCategoryRows(summary,history,localScores) {
  const host=$('categoryScoreRows');
  if (!host.children.length) host.innerHTML=categoryNames.map((name,index)=>`<div class="score-row">${icon(categoryIcons[index])}<span>${name}</span><div class="score-track"><div class="score-fill"></div></div><span class="score-number">—</span><span class="score-delta" title="Change from previous observation">—</span></div>`).join('');
  [...host.children].forEach((row,index)=>{
    const score=number(localScores?.[index] ?? summary?.categories?.[categoryKeys[index]]?.[categoryFields[index]]);
    row.querySelector('.score-fill').style.width=`${Math.max(0,Math.min(100,score || 0))}%`;
    row.querySelector('.score-number').textContent=score===null?'—':Math.round(score);
    const previous=localScores ? null : number(history?.at(-2)?.[categoryKeys[index]]);
    const change=previous===null || score===null ? null : score-previous;
    const delta=row.querySelector('.score-delta');
    delta.textContent=change===null?'—':`${change>0?'▲':change<0?'▼':'•'} ${Math.abs(change).toFixed(0)}`;
    delta.classList.toggle('negative',change>0);
  });
}

function renderMarkets(markets) {
  lastMarkets=markets;
  if(marketSort!=="default") markets=[...markets].sort((a,b)=>marketSort==="gainers"?Number(b.change24hPct)-Number(a.change24hPct):Number(a.change24hPct)-Number(b.change24hPct));
  const host=$('marketTable');host.replaceChildren();
  if (!markets.length) {const p=document.createElement('p');p.className='empty-state';p.textContent='Waiting for market data.';host.append(p);return;}
  const table=document.createElement('table');
  table.innerHTML='<thead><tr><th scope="col">Symbol</th><th scope="col">Name</th><th scope="col">Price</th><th scope="col">Δ 24h</th><th scope="col">Trend</th></tr></thead>';
  const tbody=document.createElement('tbody');
  for (const market of markets.slice(0,5)) {
    const row=document.createElement('tr');
    const price=number(market.currentPrice),change=number(market.change24hPct);
    [String(market.symbol || market.id || '—').toUpperCase(),market.name || '—',price===null?'—':price.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:price<1?4:2}),change===null?'—':`${change>=0?'+':''}${change.toFixed(1)}%`].forEach((text,index)=>{
      const cell=document.createElement('td');cell.textContent=text;cell.title=text;if(index===3)cell.className=change>=0?'positive':'negative';row.append(cell);
    });
    const historical=Array.isArray(market.priceHistory7d)?market.priceHistory7d.filter(Number.isFinite):[];
    const prices=historical.length>1?historical:marketSamples.get(market.id || market.symbol) || [];
    const trend=document.createElement('td');trend.innerHTML=sparkline(prices,change>=0?'#51e1b2':'#ff5364');trend.title=historical.length>1?'Observed prices over the past 7 days; color indicates 24-hour change':'Price observations during this session';row.append(trend);tbody.append(row);
  }
  table.append(tbody);host.append(table);
}

function formatTimestamp(value) {
  if(!value)return 'Feed snapshot';const date=new Date(Number.isFinite(Number(value))?Number(value):value);return Number.isNaN(date.getTime())?'Feed snapshot':date.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,'Z');
}
export function renderAssetSummary(record) {
  const host=$('assetSummary');host.replaceChildren();
  $('assetProvider').textContent=record?.source || 'SATELLITE';
  document.querySelector('.asset-active').textContent=record?'● Tracked':'● Waiting';
  if (!record) {const p=document.createElement('p');p.className='empty-state';p.textContent='Select a satellite to inspect its telemetry.';host.append(p);return;}
  const tle=record.tle2?.trim().split(/\s+/);
  const inclination=number(record.inclinationDeg ?? tle?.[2]);
  const meanMotion=number(record.meanMotion ?? tle?.[7]);
  const rows=[['NORAD ID',record.noradId || record.id],['Altitude',Number.isFinite(Number(record.altitudeM))?`${Math.round(record.altitudeM/1000)} km`:'Unavailable'],['Inclination',inclination===null?'Unavailable':`${inclination.toFixed(1)}°`],['Period',meanMotion>0?`${(1440/meanMotion).toFixed(1)} min`:'Unavailable'],['Source',record.source || 'Unknown'],['Last updated',formatTimestamp(record.updatedAt || record.timestamp)]];
  for (const [key,value] of rows) {
    const row=document.createElement('div');row.className='sat-kv';const k=document.createElement('span');k.className='k';k.textContent=key;const v=document.createElement('span');v.className='v';v.textContent=String(value ?? 'Unavailable');row.append(k,v);host.append(row);
  }
}

export function renderNearbySummary(context) {
  const host=$('nearbySummary');host.replaceChildren();
  if (!context) return;
  const section=context.geopolitics || context.finance || context.infrastructure || context.environmental || {};
  const groups=Object.entries(section).filter(([,value])=>Array.isArray(value) && value.length);
  if (!groups.length) {host.innerHTML='<div class="intelligence-row"><span class="intelligence-dot"></span><span>No nearby records in the current feeds</span></div>';return;}
  for (const [key,items] of groups.slice(0,3)) {
    const row=document.createElement('div');row.className='intelligence-row';
    const dot=document.createElement('span');dot.className='intelligence-dot';
    const text=document.createElement('span');text.textContent=items[0].title || items[0].name || items[0].callsign || items[0].service || items[0].cve || items[0].vendor || key;
    const count=document.createElement('small');count.textContent=`${items.length} records`;row.append(dot,text,count);host.append(row);
  }
}

const endpointPlugin={id:'vector-risk-endpoint',afterDatasetsDraw(chart){
  if(!chart.canvas.id.startsWith('riskChart'))return;const points=chart.getDatasetMeta(0).data;if(!points.length)return;
  const point=points.at(-1),value=Number(chart.data.datasets[0].data.at(-1));const {ctx,chartArea}=chart;
  const labelY=Math.max(chartArea.top+18,Math.min(chartArea.bottom-20,point.y));
  ctx.save();ctx.strokeStyle='#ff5364';ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(point.x,chartArea.top);ctx.lineTo(point.x,chartArea.bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ff5364';ctx.shadowColor='#ff536455';ctx.shadowBlur=7;ctx.beginPath();ctx.arc(point.x,point.y,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle=colorForRisk(value);ctx.font='600 15px "DM Sans", sans-serif';ctx.fillText(String(Math.round(value)),point.x+13,labelY-4);ctx.font='10px "DM Sans", sans-serif';ctx.fillText(value>75?'Critical':value>50?'Elevated':value>25?'Moderate':'Stable',point.x+13,labelY+11);ctx.restore();
}};
let endpointRegistered=false;
export function styleRiskChart(chart,scope,timestamps=chart.$timestamps || []) {
  if (!chart) return;
  chart.stop();chart.options.animation=false;
  if(!endpointRegistered){chart.constructor.register(endpointPlugin);endpointRegistered=true;}
  const dataset=chart.data.datasets[0];
  chart.$timestamps=timestamps;
  chart.options.onResize=(resized,size)=>{resized.options.scales.x.ticks.maxTicksLimit=size.width<450?4:7;};
  chart.options.layout={padding:{top:3,right:58,bottom:0,left:0}};
  const stops=[[0,'#4de7b2'],[.38,'#b4e56a'],[.57,'#ffd04f'],[.78,'#ff9852'],[1,'#ff5364']];
  dataset.borderColor=({chart:c})=>{const a=c.chartArea;if(!a)return '#4de7b2';const g=c.ctx.createLinearGradient(a.left,0,a.right,0);stops.forEach(([p,v])=>g.addColorStop(p,v));return g;};
  dataset.backgroundColor=({chart:c})=>{const a=c.chartArea;if(!a)return 'transparent';const layer=document.createElement('canvas');layer.width=Math.ceil(c.width);layer.height=Math.ceil(c.height);const paint=layer.getContext('2d');const gradient=paint.createLinearGradient(a.left,0,a.right,0);stops.forEach(([p,v])=>gradient.addColorStop(p,v));paint.fillStyle=gradient;paint.fillRect(a.left,a.top,a.width,a.height);paint.globalCompositeOperation='destination-in';const fade=paint.createLinearGradient(0,a.top,0,a.bottom);fade.addColorStop(0,'rgba(0,0,0,.30)');fade.addColorStop(1,'rgba(0,0,0,0)');paint.fillStyle=fade;paint.fillRect(0,0,c.width,c.height);return c.ctx.createPattern(layer,'no-repeat');};
  dataset.segment=undefined;dataset.borderWidth=2;dataset.pointRadius=0;dataset.pointHoverRadius=4;dataset.tension=.22;dataset.fill='origin';
  chart.options.scales.x.ticks.font={size:9,family:'DM Sans'};
  chart.options.scales.x.ticks.color='#a8bdce';chart.options.scales.x.ticks.maxTicksLimit=7;chart.options.scales.x.ticks.maxRotation=0;chart.options.scales.x.ticks.padding=9;chart.options.scales.x.grid={color:'#45617336',drawTicks:false};chart.options.scales.x.border={color:'#53748565',dash:[2,2]};
  chart.options.scales.y.ticks.stepSize=25;chart.options.scales.y.ticks.color='#a8bdce';chart.options.scales.y.ticks.font={size:10,family:'DM Sans'};chart.options.scales.y.ticks.padding=10;chart.options.scales.y.grid={color:'#45617336',drawTicks:false};chart.options.scales.y.border={display:false,dash:[2,2]};
  chart.options.interaction={mode:'index',intersect:false};
  chart.options.plugins.tooltip={backgroundColor:'#101b30ed',borderColor:'#74659580',borderWidth:1,titleColor:'#e2f2fc',bodyColor:'#b5d3e4',displayColors:false,callbacks:{title:items=>{const time=chart.$timestamps?.[items[0]?.dataIndex];return time?new Date(time).toLocaleString():items[0]?.label;},label:item=>`Risk: ${Number(item.raw).toFixed(1)} / 100`}};
  const latest=number(dataset.data.at(-1));
  const endpoint=$('riskEndpoint');endpoint.replaceChildren();
  if(latest!==null){endpoint.style.color=colorForRisk(latest);endpoint.append(document.createTextNode(Math.round(latest)));const small=document.createElement('small');small.textContent=latest>75?'Critical':latest>50?'Elevated':latest>25?'Moderate':'Stable';endpoint.append(small);}
  chart.update('none');
}

export function initPrecision({onVisual,onSpeed,onPause,onLocate,onFocusAsset,onIntel,onCameras,onNotice,onGlobal,onScope}) {
  const chartDialog=document.createElement('dialog');chartDialog.className='chart-dialog';chartDialog.setAttribute('aria-labelledby','expandedChartTitle');
  chartDialog.innerHTML='<header><h2 id="expandedChartTitle"></h2><button aria-label="Close expanded chart">'+icon('close')+'</button></header><p class="chart-dialog-caption"></p><div class="expanded-chart-body"></div>';
  document.body.append(chartDialog);let expandedChart;
  chartDialog.querySelector('header button').addEventListener('click',()=>chartDialog.close());
  chartDialog.addEventListener('close',()=>{expandedChart?.destroy();expandedChart=null;});
  for(const button of document.querySelectorAll('[data-expand-chart]'))button.addEventListener('click',()=>{
    const risk=button.dataset.expandChart==='risk';chartDialog.querySelector('h2').textContent=risk?'Risk trajectory':'Market movers';
    chartDialog.querySelector('p').textContent=`Snapshot · ${new Date().toLocaleString()} · ${risk?(document.querySelector('[data-scope-select]')?.value==='local'?'Selected location':'Global intelligence'):'USD prices · Sparkline: 7 days where available, otherwise this session'}`;
    const body=chartDialog.querySelector('.expanded-chart-body');body.replaceChildren();
    if(risk){
      const original=Chart.getChart('riskChart');if(!original)return;
      const canvas=document.createElement('canvas');canvas.id='riskChartExpanded';body.append(canvas);chartDialog.showModal();
      expandedChart=new Chart(canvas,{
        type:'line',
        data:{labels:[...original.data.labels],datasets:[{label:original.data.datasets[0].label,data:[...original.data.datasets[0].data]}]},
        options:{animation:false,responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{},grid:{}},y:{min:0,max:100,ticks:{},grid:{}}}}
      });
      styleRiskChart(expandedChart,null,original.$timestamps);
    }
    else{const table=document.createElement('div');table.className='market-table expanded-market';table.append(...[...$('marketTable').children].map(child=>child.cloneNode(true)));body.append(table);chartDialog.showModal();}
  });
  for(const button of document.querySelectorAll('[data-visual]'))button.addEventListener('click',()=>{
    for(const item of document.querySelectorAll('[data-visual]')){item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));}
    $('modeSelect').value=button.dataset.visual;onVisual(button.dataset.visual);
  });
  for(const button of document.querySelectorAll('[data-speed]'))button.addEventListener('click',()=>{
    for(const item of document.querySelectorAll('[data-speed]')){item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));}
    $('speedSelect').value=button.dataset.speed;onSpeed(Number(button.dataset.speed));
  });
  $('transportToggle').addEventListener('click',()=>{
    const paused=onPause();$('transportToggle').innerHTML=icon(paused?'play':'pause');$('transportToggle').setAttribute('aria-label',paused?'Resume display':'Pause display');
  });
  $('liveBtn').addEventListener('click',()=>{$('transportToggle').innerHTML=icon('pause');$('transportToggle').setAttribute('aria-label','Pause live display');});
  $('focusAssetBtn').addEventListener('click',onFocusAsset);
  $('viewIntelBtn').addEventListener('click',onIntel);
  $('notificationsBtn').addEventListener('click',onIntel);
  $('cameraShortcut').addEventListener('click',onCameras);
  $('profileBtn').addEventListener('click',()=>onNotice('Vector · Real-time geospatial intelligence. Feed availability and update cadence vary by source.'));
  $('jumpToLayers').addEventListener('click',()=>$('datasetFilters').scrollIntoView({behavior:'smooth',block:'nearest'}));
  for(const select of document.querySelectorAll('[data-scope-select]'))select.addEventListener('change',()=>onScope(select.value));
  $('marketSort').addEventListener('change',event=>{marketSort=event.target.value;renderMarkets(lastMarkets);});
  document.addEventListener('keydown',event=>{if((event.metaKey || event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('quickSearchInput').focus();}});
  const locate=async()=>{
    const query=$('locationQuery').value.trim();if(!query)return;
    const button=$('locateQueryBtn');button.disabled=true;
    try{
      const coords=query.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      let location;
      if(coords){const lat=Number(coords[1]),lon=Number(coords[2]);if(Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Coordinates must be within ±90 latitude and ±180 longitude.');location={lat,lon,name:query};}
      else{
        const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name:query,count:'1',language:'en',format:'json'})}`);
        if(!response.ok)throw new Error('Location search is unavailable. Enter latitude, longitude instead.');
        const payload=await response.json();const result=payload.results?.[0];if(!result)throw new Error('No matching location. Try a city name or latitude, longitude.');location={lat:result.latitude,lon:result.longitude,name:[result.name,result.country].filter(Boolean).join(', ')};
      }
      $('locationQuery').value=location.name;onLocate(location);
    }catch(error){onNotice(error.message);}finally{button.disabled=false;}
  };
  $('locateQueryBtn').addEventListener('click',locate);$('locationQuery').addEventListener('keydown',event=>{if(event.key==='Enter')locate();});
}

export function updatePrecisionTimeline({live,time,start,end,paused}) {
  const now=Date.now();const to=live?now:end || now;const from=live?now-7200000:start || now-7200000;
  $('timelineTimestamp').textContent=paused?'Display paused':new Date(live?now:time || now).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,'Z');
  $('timelineLabels').replaceChildren();
  for(let i=0;i<7;i++){const label=document.createElement('span');label.textContent=new Date(from+(to-from)*i/6).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});$('timelineLabels').append(label);}
}
