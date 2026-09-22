const ids = ["scenario","age","spouseAge","income1","income2","retireAge","endAge","pension","retirementPay","child1","child2","education","living","leisure","savingsTarget","cash","investments","inflation","returnRate","price","downPayment","interest","loanYears","maintenance","parking","ownerAnnual","purchaseCost","rent","rentFee","rentAnnual","rentGrowth","homeGrowth","saleCost","homeFloor"];
const initial = Object.fromEntries(ids.map(id => [id, document.getElementById(id).value]));
const yen = value => `${Math.round(value / 10000).toLocaleString("ja-JP")}万円`;
const signedYen = value => value < 0 ? `▲${yen(Math.abs(value))}` : yen(value);
const num = id => Number(document.getElementById(id).value || 0);
const pct = id => num(id) / 100;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function takeHome(gross) {
  if (gross <= 0) return 0;
  const salaryDeduction = gross <= 1_625_000 ? 550_000 : gross <= 1_800_000 ? gross * .4 - 100_000 : gross <= 3_600_000 ? gross * .3 + 80_000 : gross <= 6_600_000 ? gross * .2 + 440_000 : gross <= 8_500_000 ? gross * .1 + 1_100_000 : 1_950_000;
  const social = gross * .15;
  const taxable = Math.max(0, gross - salaryDeduction - social - 480_000);
  let incomeTax = 0;
  if (taxable <= 1_950_000) incomeTax = taxable * .05;
  else if (taxable <= 3_300_000) incomeTax = taxable * .1 - 97_500;
  else if (taxable <= 6_950_000) incomeTax = taxable * .2 - 427_500;
  else if (taxable <= 9_000_000) incomeTax = taxable * .23 - 636_000;
  else incomeTax = taxable * .33 - 1_536_000;
  const residentTax = taxable * .1 + 5_000;
  return Math.max(0, gross - social - Math.max(0, incomeTax) - residentTax);
}

function monthlyPayment(principal, annualRate, years) {
  const months = Math.max(1, years * 12);
  const r = annualRate / 12;
  return r === 0 ? principal / months : principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
}

function childCost(age, plan) {
  if (age < 0 || age > 21) return 0;
  const publicCosts = age <= 5 ? 600_000 : age <= 11 ? 700_000 : age <= 14 ? 850_000 : age <= 17 ? 1_000_000 : 1_400_000;
  if (plan === "university" && age >= 18) return 2_000_000;
  if (plan === "high" && age >= 15) return age >= 18 ? 2_000_000 : 1_600_000;
  if (plan === "middle" && age >= 12) return age >= 18 ? 2_000_000 : age >= 15 ? 1_600_000 : 1_400_000;
  return publicCosts;
}

function buildModel() {
  const age = num("age"), endAge = Math.max(age, num("endAge")), retireAge = num("retireAge");
  const years = endAge - age;
  const scenario = document.getElementById("scenario").value;
  const rateStress = scenario === "rate" || scenario === "combined" ? .01 : 0;
  const incomeStress = scenario === "income" || scenario === "combined";
  const price = num("price") * 10000, down = num("downPayment") * 10000;
  const purchaseCosts = price * pct("purchaseCost");
  const loan = Math.max(0, price - down);
  const rate = pct("interest") + rateStress;
  const payment = monthlyPayment(loan, rate, num("loanYears"));
  const monthlyRate = rate / 12;
  const totalMonths = num("loanYears") * 12;
  let loanBalance = loan;
  let purchaseAssets = num("cash") * 10000 + num("investments") * 10000 - down - purchaseCosts;
  let rentAssets = num("cash") * 10000 + num("investments") * 10000;
  const inflation = pct("inflation"), investmentReturn = pct("returnRate");
  const rows = [];

  for (let y = 0; y <= years; y++) {
    const currentAge = age + y;
    const incomeFactor = Math.pow(1.01, y);
    let gross1 = num("income1") * 10000 * incomeFactor;
    let gross2 = num("income2") * 10000 * incomeFactor;
    if (incomeStress && y >= 3 && y < 6) { gross1 *= .7; gross2 *= .7; }
    const workingIncome = takeHome(gross1) + takeHome(gross2);
    const income = currentAge < retireAge ? workingIncome : num("pension") * 10000;
    const livingBase = currentAge < retireAge ? num("living") * 120000 : num("living") * 120000 * .78;
    const living = livingBase * Math.pow(1 + inflation, y);
    const leisure = num("leisure") * 10000 * (currentAge < retireAge ? 1 : .7) * Math.pow(1 + inflation, y);
    const education = childCost(num("child1") < 0 ? -1 : num("child1") + y, document.getElementById("education").value) + childCost(num("child2") < 0 ? -1 : num("child2") + y, document.getElementById("education").value);

    let annualLoan = 0;
    for (let m = 0; m < 12 && y * 12 + m < totalMonths; m++) {
      if (y === 0) break;
      const interestPart = loanBalance * monthlyRate;
      const principalPart = Math.min(loanBalance, payment - interestPart);
      loanBalance = Math.max(0, loanBalance - principalPart);
      annualLoan += payment;
    }
    const ownerCosts = (num("maintenance") + num("parking")) * 120000 * Math.pow(1 + inflation, y) + num("ownerAnnual") * 10000 * Math.pow(1 + inflation, y);
    const purchaseHousing = annualLoan + ownerCosts;
    const rentHousing = (num("rent") + num("rentFee")) * 120000 * Math.pow(1 + pct("rentGrowth"), y) + num("rentAnnual") * 10000 * Math.pow(1 + inflation, y);
    const retirementPay = currentAge === retireAge ? num("retirementPay") * 10000 : 0;
    const mortgageCredit = y >= 1 && y <= 13 ? Math.min(loanBalance, 45_000_000) * .007 : 0;
    const purchaseAnnual = income + retirementPay + mortgageCredit - living - leisure - education - purchaseHousing;
    const rentAnnual = income + retirementPay - living - leisure - education - rentHousing;
    purchaseAssets += purchaseAnnual + Math.max(0, purchaseAssets) * investmentReturn;
    rentAssets += rentAnnual + Math.max(0, rentAssets) * investmentReturn;
    const homeValue = Math.max(price * pct("homeFloor"), price * Math.pow(1 + pct("homeGrowth"), y));
    const homeEquity = Math.max(0, homeValue * (1 - pct("saleCost")) - loanBalance);
    rows.push({age: currentAge, income, livingLeisure: living + leisure, education, purchaseHousing, purchaseAnnual, purchaseAssets, rentHousing, rentAnnual, rentAssets, homeValue, loanBalance, homeEquity, purchaseTotal: purchaseAssets + homeEquity, rentTotal: rentAssets});
  }

  const disposable = takeHome(num("income1") * 10000) + takeHome(num("income2") * 10000);
  const livingAnnual = num("living") * 120000;
  const leisureAnnual = num("leisure") * 10000;
  const savingsAnnual = num("savingsTarget") * 10000;
  const ownerMonthly = (num("maintenance") + num("parking")) * 10000 + num("ownerAnnual") * 10000 / 12;
  const priceLine = (ratio, rateAdd, keepSavings) => {
    const debtLimit = disposable / 12 * ratio;
    const cashflowLimit = Math.max(0, (disposable - livingAnnual - leisureAnnual - (keepSavings ? savingsAnnual : 0)) / 12 - ownerMonthly);
    const affordablePayment = Math.max(0, Math.min(debtLimit, cashflowLimit));
    const factor = monthlyPayment(1, pct("interest") + rateAdd, num("loanYears"));
    const affordableLoan = factor > 0 ? affordablePayment / factor : 0;
    return Math.max(0, (affordableLoan + down) / (1 + pct("purchaseCost")));
  };
  const roomyPrice = priceLine(.25, .02, true);
  const safePrice = Math.max(roomyPrice, priceLine(.30, .01, true));
  const upperPrice = Math.max(safePrice, priceLine(.35, .005, false));
  return {rows, payment, roomyPrice, safePrice, upperPrice, price, scenario};
}

function drawChart(canvas, rows, series) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(300, rect.width * ratio); canvas.height = Math.max(220, rect.height * ratio);
  const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio);
  const w = rect.width, h = rect.height, pad = {l:58,r:18,t:20,b:34};
  const values = series.flatMap(s => rows.map(r => s.get(r))).filter(Number.isFinite);
  let min = Math.min(0, ...values), max = Math.max(1, ...values);
  const spread = max - min || 1; min -= spread * .06; max += spread * .08;
  const x = i => pad.l + i * (w - pad.l - pad.r) / Math.max(1, rows.length - 1);
  const y = v => pad.t + (max - v) * (h - pad.t - pad.b) / (max - min);
  ctx.clearRect(0,0,w,h); ctx.font="12px Yu Gothic, sans-serif"; ctx.fillStyle="#6d7888"; ctx.strokeStyle="#dce4ec"; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const value=min+(max-min)*i/4;const py=y(value);ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(w-pad.r,py);ctx.stroke();ctx.textAlign="right";ctx.fillText(`${Math.round(value/10000).toLocaleString()}万`,pad.l-8,py+4)}
  const step=Math.max(1,Math.ceil(rows.length/7)); rows.forEach((r,i)=>{if(i%step===0||i===rows.length-1){ctx.textAlign="center";ctx.fillText(`${r.age}歳`,x(i),h-10)}});
  if(min<0&&max>0){ctx.strokeStyle="#b66";ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pad.l,y(0));ctx.lineTo(w-pad.r,y(0));ctx.stroke();ctx.setLineDash([])}
  series.forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=2.5;ctx.beginPath();rows.forEach((r,i)=>{const py=y(s.get(r));i?ctx.lineTo(x(i),py):ctx.moveTo(x(i),py)});ctx.stroke()});
  let lx=pad.l; series.forEach(s=>{ctx.fillStyle=s.color;ctx.fillRect(lx,pad.t-13,18,3);ctx.fillStyle="#425065";ctx.textAlign="left";ctx.fillText(s.label,lx+24,pad.t-8);lx+=ctx.measureText(s.label).width+62});
}

function render() {
  const model = buildModel(), rows = model.rows, last = rows.at(-1);
  const shortage = rows.find(r => r.purchaseAssets < 0);
  const minimum = rows.reduce((a,b)=>a.purchaseAssets<b.purchaseAssets?a:b);
  let verdict = "安心して検討しやすい", state = "", text = "価格目安と生涯収支の両面で検討しやすい試算です。";
  if (model.price <= model.roomyPrice) text="金利上昇と年間貯蓄目標を考慮しても、ゆとりを持ちやすい試算です。";
  else if (model.price <= model.safePrice) text="生活と年間貯蓄目標を維持しやすい、安心購入ライン内の試算です。";
  else if (model.price <= model.upperPrice) {verdict="条件を確認しながら検討";state="warning";text="検討上限ライン内です。教育費期や退職時の手元資金を確認しながら検討できる水準です。";}
  else {verdict="購入条件の見直しをおすすめ";state="danger";text="検討上限ラインを超えています。自己資金、物件価格、生活設計をご確認ください。";}
  if (shortage) {verdict="家計条件を確認しながら検討";state="warning";text=`${shortage.age}歳ごろに手元の金融資産が0円を下回る試算です。住宅純資産を含む比較と、老後の収入・生活費をご確認ください。`;}
  if (model.price > model.upperPrice) {verdict="購入条件の見直しをおすすめ";state="danger";text="検討上限ラインを超えています。自己資金、物件価格、生活設計をご確認ください。";}
  const card=document.getElementById("verdictCard");card.className=`verdict-card ${state}`;document.getElementById("verdict").textContent=verdict;document.getElementById("verdictText").textContent=text;
  const scenarioNames={standard:"標準シナリオ",rate:"金利上昇シナリオ",income:"収入減少シナリオ",combined:"複合シナリオ"};document.getElementById("scenarioChip").textContent=scenarioNames[model.scenario];
  document.getElementById("metricPrice").textContent=yen(model.price);document.getElementById("metricRoomy").textContent=yen(model.roomyPrice);document.getElementById("metricSafe").textContent=yen(model.safePrice);document.getElementById("metricUpper").textContent=yen(model.upperPrice);document.getElementById("metricPayment").textContent=`${yen(model.payment)}/月`;document.getElementById("metricMinimum").textContent=`${signedYen(minimum.purchaseAssets)}（${minimum.age}歳）`;
  const badge=document.getElementById("shortageBadge");badge.textContent=shortage?`${shortage.age}歳ごろに手元資金を確認`:`${num("endAge")}歳までプラス`;badge.className=shortage?"warning":"";
  document.getElementById("assetExplanation").innerHTML=shortage?`<strong>この表示について</strong><br>預貯金・投資資産が0円を下回る計算です。住宅そのものがなくなる意味ではありません。「購入と賃貸」で住宅純資産を含む総資産も確認できます。`:`<strong>手元資金について</strong><br>${num("endAge")}歳まで、預貯金・投資資産が0円を下回らない試算です。`;
  document.getElementById("buyTotal").textContent=yen(last.purchaseTotal);document.getElementById("rentTotal").textContent=signedYen(last.rentTotal);
  const ages=[65,75,85,num("endAge")].filter((v,i,a)=>v>=num("age")&&v<=num("endAge")&&a.indexOf(v)===i);document.getElementById("compareTable").innerHTML=ages.map(a=>{const r=rows.find(x=>x.age===a)||last;return `<tr><td>${a}歳</td><td class="${r.purchaseAssets<0?'negative':''}">${signedYen(r.purchaseAssets)}</td><td>${yen(r.homeEquity)}</td><td class="${r.purchaseTotal<0?'negative':''}">${signedYen(r.purchaseTotal)}</td><td class="${r.rentAssets<0?'negative':''}">${signedYen(r.rentAssets)}</td></tr>`}).join("");
  document.getElementById("cashflowTable").innerHTML=rows.map(r=>`<tr><td>${r.age}歳</td><td>${yen(r.income)}</td><td>${yen(r.livingLeisure)}</td><td>${yen(r.education)}</td><td>${yen(r.purchaseHousing)}</td><td class="${r.purchaseAnnual<0?'negative':''}">${signedYen(r.purchaseAnnual)}</td><td class="${r.purchaseAssets<0?'negative':''}">${signedYen(r.purchaseAssets)}</td></tr>`).join("");
  requestAnimationFrame(()=>{drawChart(document.getElementById("assetChart"),rows,[{label:"手元の金融資産",color:"#2f75b5",get:r=>r.purchaseAssets}]);drawChart(document.getElementById("compareChart"),rows,[{label:"購入：総資産",color:"#2f75b5",get:r=>r.purchaseTotal},{label:"賃貸：金融資産",color:"#7f8fa6",get:r=>r.rentTotal}])});
}

let timer; ids.forEach(id=>document.getElementById(id).addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(render,60)}));
document.querySelectorAll(".tab").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".tab,.tab-panel").forEach(x=>x.classList.remove("active"));button.classList.add("active");document.getElementById(button.dataset.tab).classList.add("active");render()}));
document.querySelectorAll(".help").forEach(button=>button.addEventListener("click",e=>{e.preventDefault();const toast=document.getElementById("toast");toast.textContent=button.dataset.help;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),3500)}));
document.getElementById("printButton").addEventListener("click",()=>window.print());
document.getElementById("resetButton").addEventListener("click",()=>{ids.forEach(id=>document.getElementById(id).value=initial[id]);render()});
window.addEventListener("resize",()=>{clearTimeout(timer);timer=setTimeout(render,120)});
render();

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  Promise.resolve(document.modelContext.registerTool({
    name:"set_housing_simulation_inputs",
    title:"住宅購入試算の条件を設定",
    description:"物件価格、世帯年収、年齢、現在家賃を画面の入力欄へ反映し、試算を更新します。",
    inputSchema:{type:"object",properties:{priceMan:{type:"number",minimum:500},income1Man:{type:"number",minimum:0},income2Man:{type:"number",minimum:0},age:{type:"number",minimum:18,maximum:75},rentMan:{type:"number",minimum:0}},additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){const map={priceMan:"price",income1Man:"income1",income2Man:"income2",age:"age",rentMan:"rent"};Object.entries(map).forEach(([key,id])=>{if(input[key]!==undefined)document.getElementById(id).value=input[key]});render();return {status:"updated",verdict:document.getElementById("verdict").textContent};}
  },{signal:lifecycle.signal})).catch(()=>{});
  Promise.resolve(document.modelContext.registerTool({
    name:"get_housing_simulation_summary",
    title:"住宅購入試算の結果を取得",
    description:"現在画面に表示されている物件価格、3つの購入ライン、返済額、総合判定を取得します。",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute(){return {price:document.getElementById("metricPrice").textContent,roomyPrice:document.getElementById("metricRoomy").textContent,safePrice:document.getElementById("metricSafe").textContent,upperPrice:document.getElementById("metricUpper").textContent,monthlyPayment:document.getElementById("metricPayment").textContent,verdict:document.getElementById("verdict").textContent};}
  },{signal:lifecycle.signal})).catch(()=>{});
}
