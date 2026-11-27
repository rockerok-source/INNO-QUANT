/* US ETF Quant Desk — prototype
 * 실데이터 연결 시 /api/market-data 응답 형식:
 * { "mode":"live", "asOf":"ISO date", "assets":[
 *   { "symbol":"SPY", "name":"SPDR S&P 500 ETF", "prices":[
 *     {"date":"2026-01-02","open":...,"high":...,"low":...,"close":...,"volume":...}
 *   ]}
 * ]}
 * prices는 오래된 날짜부터 정렬된 일봉 OHLCV 배열이어야 합니다.
 */
const ETF_UNIVERSE = [
 ["SPY","SPDR S&P 500"],["QQQ","Invesco QQQ"],["IWM","Russell 2000"],["DIA","Dow Jones"],["VTI","Total US Market"],
 ["VOO","Vanguard S&P 500"],["SCHD","US Dividend Equity"],["VYM","High Dividend Yield"],["DGRO","Dividend Growth"],["XLK","Technology"],
 ["SMH","Semiconductors"],["SOXX","Semiconductor"],["SOXL","3x Semiconductor Bull"],["SOXS","3x Semiconductor Bear"],["XLF","Financials"],
 ["XLE","Energy"],["XLV","Healthcare"],["XLI","Industrials"],["XLY","Consumer Discretionary"],["XLP","Consumer Staples"],
 ["XLU","Utilities"],["XLB","Materials"],["ARKK","Innovation"],["TQQQ","3x Nasdaq Bull"],["SQQQ","3x Nasdaq Bear"],
 ["TLT","20+ Year Treasury"],["IEF","7-10 Year Treasury"],["SHY","1-3 Year Treasury"],["GLD","Gold"],["SLV","Silver"],
 ["USO","Oil"],["UNG","Natural Gas"],["IBIT","Bitcoin"],["BITO","Bitcoin Strategy"],["HYG","High Yield Bonds"],
 ["LQD","Investment Grade Bonds"],["JNK","High Yield Corporate"],["EEM","Emerging Markets"],["EFA","Developed Markets"],["VNQ","US Real Estate"]
];

const $ = id => document.getElementById(id);
let allAssets = [];
let selectedSymbol = null;
let timeframe = "daily";

function seeded(seed){let x=seed>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;}}
function demoPrices(symbol,index){
  const rand=seeded(symbol.split("").reduce((a,c)=>a+c.charCodeAt(0),index+31));
  const base=35+(index*17%360), drift=((index%7)-2.5)*0.00022, vol=0.009+(index%5)*0.003;
  let p=base, arr=[], date=new Date(); date.setDate(date.getDate()-280);
  for(let i=0;i<220;i++){
    const r=(rand()-.48)*vol*2+drift;
    const open=p*(1+(rand()-.5)*vol*.45), close=Math.max(2,p*(1+r));
    const high=Math.max(open,close)*(1+rand()*vol*.55), low=Math.min(open,close)*(1-rand()*vol*.55);
    const volume=Math.round((1.2+rand()*5)*1000000*(1+(i%19===0?1.8:0)));
    const d=new Date(date);d.setDate(date.getDate()+i);
    if(d.getDay()!==0&&d.getDay()!==6)arr.push({date:d.toISOString().slice(0,10),open,high,low,close,volume});
    p=close;
  }
  return arr;
}
function sma(values,n){if(values.length<n)return null;return values.slice(-n).reduce((a,b)=>a+b,0)/n;}
function ema(values,n){if(values.length<n)return null;const k=2/(n+1);let v=values.slice(0,n).reduce((a,b)=>a+b,0)/n;for(let i=n;i<values.length;i++)v=values[i]*k+v*(1-k);return v;}
function rsi(values,n=14){
  if(values.length<n+1)return 50;let gain=0,loss=0;
  for(let i=values.length-n;i<values.length;i++){const d=values[i]-values[i-1];if(d>0)gain+=d;else loss-=d;}
  if(loss===0)return 100;return 100-(100/(1+gain/loss));
}
function calcATR(bars,n=14){
  if(bars.length<n+1)return 0;const tr=[];
  for(let i=bars.length-n;i<bars.length;i++){const b=bars[i],prev=bars[i-1];tr.push(Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close)));}
  return tr.reduce((a,b)=>a+b,0)/tr.length;
}
function aggregateWeekly(bars){
  const map=new Map();bars.forEach(b=>{const d=new Date(b.date+"T00:00:00");d.setDate(d.getDate()-((d.getDay()+6)%7));const k=d.toISOString().slice(0,10);
    if(!map.has(k))map.set(k,{date:k,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume});
    else{const x=map.get(k);x.high=Math.max(x.high,b.high);x.low=Math.min(x.low,b.low);x.close=b.close;x.volume+=b.volume;}
  });return [...map.values()];
}
function analyze(asset){
  const bars=timeframe==="weekly"?aggregateWeekly(asset.prices):asset.prices;
  const closes=bars.map(x=>x.close),last=bars[bars.length-1],prev=bars[bars.length-2];
  const fast=sma(closes,timeframe==="weekly"?10:20),mid=sma(closes,timeframe==="weekly"?20:50),slow=sma(closes,timeframe==="weekly"?40:100);
  const rv=rsi(closes,14),m=ema(closes,12)-ema(closes,26),sig=ema(closes.slice(-35).map((_,i)=>ema(closes.slice(0,closes.length-34+i+1),12)-ema(closes.slice(0,closes.length-34+i+1),26)).filter(Number.isFinite),9);
  const volRecent=bars.slice(-5).reduce((a,b)=>a+b.volume,0)/5,volPrior=bars.slice(-25,-5).reduce((a,b)=>a+b.volume,0)/20;
  const flow=volRecent/Math.max(1,volPrior),atr=calcATR(bars,14),momentum=(last.close/closes[Math.max(0,closes.length-(timeframe==="weekly"?13:21))]-1)*100;
  const trend=last.close>fast&&fast>mid?"상승":last.close<fast&&fast<mid?"하락":"혼조";
  let score=50;
  score+=last.close>fast?10:-10;score+=fast>mid?10:-10;score+=mid>slow?8:-8;
  score+=rv>50&&rv<70?8:rv<35?3:rv>75?-10:0;
  score+=m>0?7:-7;score+=flow>1.15?5:flow<.75?-3:0;score+=momentum>0?7:-7;
  score=Math.max(0,Math.min(100,Math.round(score)));
  let signal=score>=75?"BUY":score>=60?"WATCH":score<=35?"SELL":"HOLD";
  if(rv>82&&signal==="BUY")signal="WATCH";
  return {...asset,last,prev,change:(last.close/prev.close-1)*100,rsi:rv,trend,flow,atrPct:atr/last.close*100,momentum,score,signal,macd:m};
}
function fmt(n,d=2){return Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});}
function signalText(s){return ({BUY:"매수 후보",WATCH:"관찰",HOLD:"중립",SELL:"매도/회피"})[s];}
function signalClass(s){return ({BUY:"buy",WATCH:"watch",HOLD:"hold",SELL:"sell"})[s];}
async function loadData(){
  try{
    const res=await fetch("./api/market-data?universe=core&interval=1d&range=1y",{cache:"no-store"});
    if(!res.ok)throw new Error("API unavailable");
    const json=await res.json();
    if(!Array.isArray(json.assets)||!json.assets.length)throw new Error("Invalid API response");
    allAssets=json.assets.map(a=>({symbol:a.symbol,name:a.name||a.symbol,prices:a.prices||[]})).filter(a=>a.prices.length>30);
    $("dataStatus").textContent="LIVE API";$("dataStatus").className="status live";$("notice").hidden=true;
  }catch(e){
    allAssets=ETF_UNIVERSE.map(([symbol,name],i)=>({symbol,name,prices:demoPrices(symbol,i)}));
    $("dataStatus").textContent="DEMO DATA";$("dataStatus").className="status demo";$("notice").hidden=false;
  }
  render();
}
function render(){
  const rows=allAssets.map(analyze).sort((a,b)=>b.score-a.score);
  const q=$("searchInput").value.trim().toLowerCase(),filter=$("signalFilter").value;
  const shown=rows.filter(a=>(!q||a.symbol.toLowerCase().includes(q)||a.name.toLowerCase().includes(q))&&(filter==="ALL"||a.signal===filter));
  $("countMetric").textContent=rows.length;$("buyMetric").textContent=rows.filter(a=>a.signal==="BUY").length;$("watchMetric").textContent=rows.filter(a=>a.signal==="WATCH").length;
  const breadth=rows.filter(a=>a.trend==="상승").length/Math.max(rows.length,1);
  $("riskMetric").textContent=breadth>.6?"낮음":breadth>.35?"보통":"높음";
  $("riskMetric").className=breadth>.6?"positive":breadth>.35?"":"down";
  $("updatedAt").textContent=`${new Date().toLocaleString("ko-KR")} 기준 계산`;
  $("etfTable").innerHTML=shown.map(a=>`<tr class="row-select" data-symbol="${a.symbol}">
    <td><span class="asset">${a.symbol}</span><small>${a.name}</small></td>
    <td>$${fmt(a.last.close)}</td><td class="${a.change>=0?"up":"down"}">${a.change>=0?"+":""}${fmt(a.change)}%</td>
    <td>${fmt(a.rsi,1)}</td><td class="${a.trend==="상승"?"up":a.trend==="하락"?"down":"flat"}">${a.trend}</td>
    <td>${a.flow>1.15?'<span class="up">유입</span>':a.flow<.75?'<span class="down">약화</span>':'보통'}</td>
    <td><strong>${a.score}</strong></td><td><span class="pill ${signalClass(a.signal)}">${signalText(a.signal)}</span></td>
  </tr>`).join("");
  $("emptyState").hidden=shown.length>0;
  document.querySelectorAll(".row-select").forEach(row=>row.addEventListener("click",()=>showDetail(rows.find(x=>x.symbol===row.dataset.symbol))));
  const current=rows.find(x=>x.symbol===selectedSymbol)||rows[0];if(current){selectedSymbol=current.symbol;showDetail(current);}
}
function showDetail(a){
  if(!a)return;selectedSymbol=a.symbol;$("detailTitle").textContent=`${a.symbol} · ${a.name}`;$("detailPrice").textContent=`$${fmt(a.last.close)}`;
  $("detailChange").textContent=`${a.change>=0?"+":""}${fmt(a.change)}%`; $("detailChange").className=a.change>=0?"up":"down";
  $("detailSignal").textContent=signalText(a.signal);$("detailSignal").className=`pill ${signalClass(a.signal)}`;
  $("detailScore").textContent=`${a.score} / 100`;$("scoreBar").style.width=a.score+"%";
  $("factorGrid").innerHTML=[["RSI(14)",fmt(a.rsi,1)],["MACD",a.macd>=0?"양수":"음수"],["이동평균",a.trend],["거래량 흐름",a.flow.toFixed(2)+"x"],["ATR",fmt(a.atrPct,2)+"%"],["모멘텀",fmt(a.momentum,2)+"%"]].map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  const reasons=[];reasons.push(a.trend==="상승"?"가격과 이동평균 정렬이 우호적":"이동평균 정렬 확인 필요");reasons.push(a.rsi>70?"RSI 과열 주의":a.rsi<35?"RSI 과매도 구간":"RSI 중립 범위");reasons.push(a.flow>1.15?"최근 거래량 증가":"거래량 확인 필요");
  $("detailReason").textContent=`판단 근거: ${reasons.join(" · ")}. 점수는 추세·모멘텀·RSI·거래량 규칙을 합산한 프로토타입이며, 기관/개인 순매수 데이터를 의미하지 않습니다.`;
}
function loadJournal(){try{return JSON.parse(localStorage.getItem("usEtfTrades")||"[]")}catch{return[]}}
function saveJournal(items){localStorage.setItem("usEtfTrades",JSON.stringify(items));renderJournal()}
function renderJournal(){
  const items=loadJournal();$("journalList").innerHTML=items.length?items.slice().reverse().map((x,i)=>`<div class="journal-item"><div><strong>${x.symbol} · ${x.side}</strong><small>${x.date} · $${fmt(x.price)} × ${x.qty}</small></div><button class="delete-trade" data-index="${items.length-1-i}" aria-label="삭제">×</button></div>`).join(""):'<p class="muted">아직 매매 기록이 없습니다.</p>';
  document.querySelectorAll(".delete-trade").forEach(b=>b.addEventListener("click",()=>{const a=loadJournal();a.splice(Number(b.dataset.index),1);saveJournal(a)}));
}
$("tradeForm").addEventListener("submit",e=>{e.preventDefault();const item={symbol:$("tradeTicker").value.trim().toUpperCase(),side:$("tradeSide").value,price:Number($("tradePrice").value),qty:Number($("tradeQty").value),date:new Date().toLocaleDateString("ko-KR")};const items=loadJournal();items.push(item);saveJournal(items);e.target.reset()});
$("timeframe").addEventListener("change",e=>{timeframe=e.target.value;render()});
$("searchInput").addEventListener("input",render);$("signalFilter").addEventListener("change",render);$("refreshBtn").addEventListener("click",loadData);
$("exportBtn").addEventListener("click",()=>{const rows=allAssets.map(analyze);const csv=["symbol,name,price,change_pct,rsi,trend,flow_ratio,score,signal",...rows.map(a=>[a.symbol,`"${a.name}"`,a.last.close,a.change,a.rsi,a.trend,a.flow,a.score,a.signal].join(","))].join("\n");const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="us-etf-quant-screen.csv";a.click();URL.revokeObjectURL(url)});
renderJournal();loadData();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
