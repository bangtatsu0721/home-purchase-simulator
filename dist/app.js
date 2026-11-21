const ids = ["scenario","spouseStatus","age","spouseAge","income1","income2","retireAge","endAge","pension","retirementPay","child1Mode","child1","child1BirthIn","child2Mode","child2","child2BirthIn","education","waitYears","futurePriceGrowth","futureInterest","futureLoanYears","waitSavings","waitRentGrowth","living","leisure","cash","investments","inflation","returnRate","price","downPayment","interest","screeningInterest","loanYears","bonusAnnual","maintenance","parking","ownerAnnual","purchaseCost","rent","rentFee","rentSubsidy","rentSubsidyYears","rentAnnual","rentGrowth","homeGrowth","saleCost","homeFloor"];
const initial = Object.fromEntries(ids.map(id => [id, document.getElementById(id).value]));
const yen = value => `${Math.round(value / 10000).toLocaleString("ja-JP")}万円`;
const signedYen = value => value < 0 ? `▲${yen(Math.abs(value))}` : yen(value);
const num = id => Number(document.getElementById(id).value || 0);
const pct = id => num(id) / 100;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hasSpouse = () => document.getElementById("spouseStatus").value === "yes";
const SAVED_PLANS_KEY = "homePurchaseSimulator.savedPlans.v1";

function showToast(message) {
  const toast=document.getElementById("toast");
  toast.textContent=message;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),2800);
}

function readSavedPlans() {
  try { return JSON.parse(localStorage.getItem(SAVED_PLANS_KEY) || "{}"); }
  catch { return {}; }
}

function writeSavedPlans(plans) {
  localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(plans));
}

function refreshSavedPlanSelect(selectedName="") {
  const select=document.getElementById("savedPlanSelect");
  const plans=readSavedPlans();
  const names=Object.keys(plans).sort((a,b)=>(plans[b].savedAt||"").localeCompare(plans[a].savedAt||""));
  select.innerHTML=`<option value="">保存済みの条件を選択</option>`+names.map(name=>`<option value="${name.replaceAll("&","&amp;").replaceAll('"','&quot;').replaceAll("<","&lt;").replaceAll(">","&gt;")}">${name.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</option>`).join("");
  if(selectedName&&plans[selectedName]) select.value=selectedName;
}

function saveCurrentPlan() {
  const input=document.getElementById("saveName");
  const name=input.value.trim();
  if(!name){showToast("保存名を入力してください");input.focus();return;}
  const plans=readSavedPlans();
  if(plans[name]&&!confirm(`「${name}」を上書き保存しますか？`)) return;
  plans[name]={savedAt:new Date().toISOString(),values:Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value]))};
  writeSavedPlans(plans);
  refreshSavedPlanSelect(name);
  showToast(`「${name}」を保存しました`);
}

function loadSelectedPlan() {
  const name=document.getElementById("savedPlanSelect").value;
  if(!name){showToast("呼び出す条件を選択してください");return;}
  const saved=readSavedPlans()[name];
  if(!saved?.values){showToast("保存データを読み込めませんでした");return;}
  ids.forEach(id=>{if(saved.values[id]!==undefined) document.getElementById(id).value=saved.values[id]});
  document.getElementById("saveName").value=name;
  syncSpouseFields();syncChildFields();render();
  showToast(`「${name}」を呼び出しました`);
}

function deleteSelectedPlan() {
  const select=document.getElementById("savedPlanSelect"),name=select.value;
  if(!name){showToast("削除する条件を選択してください");return;}
  if(!confirm(`保存した「${name}」を削除しますか？`)) return;
  const plans=readSavedPlans();delete plans[name];writeSavedPlans(plans);
  refreshSavedPlanSelect();
  if(document.getElementById("saveName").value===name) document.getElementById("saveName").value="";
  showToast(`「${name}」を削除しました`);
}

function syncSpouseFields() {
  const enabled = hasSpouse();
  ["spouseAge", "income2"].forEach(id => {
    const input = document.getElementById(id);
    input.disabled = !enabled;
    input.setAttribute("aria-disabled", String(!enabled));
    input.closest(".field").style.opacity = enabled ? "1" : ".45";
  });
}

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

// 年間ボーナス返済額を年2回に分け、その現在価値を借入額から差し引いて
// 通常月の返済額を算出する。同じ借入額の返済方法を振り分けるため、
// ボーナス返済を入力しても年間返済額が単純に上乗せされない。
function monthlyPaymentWithBonus(principal, annualRate, years, annualBonus) {
  const months = Math.max(1, years * 12);
  const r = annualRate / 12;
  const halfBonus = Math.max(0, annualBonus) / 2;
  let bonusPresentValue = 0;
  for (let month = 6; month <= months; month += 6) {
    bonusPresentValue += halfBonus / Math.pow(1 + r, month);
  }
  const monthlyPrincipal = Math.max(0, principal - bonusPresentValue);
  const annuityFactor = r === 0 ? months : (1 - Math.pow(1 + r, -months)) / r;
  return annuityFactor > 0 ? monthlyPrincipal / annuityFactor : 0;
}

function childCost(age, plan) {
  if (age < 0 || age > 21) return 0;
  const publicCosts = age <= 5 ? 600_000 : age <= 11 ? 700_000 : age <= 14 ? 850_000 : age <= 17 ? 1_000_000 : 1_400_000;
  if (plan === "university" && age >= 18) return 2_000_000;
  if (plan === "high" && age >= 15) return age >= 18 ? 2_000_000 : 1_600_000;
  if (plan === "middle" && age >= 12) return age >= 18 ? 2_000_000 : age >= 15 ? 1_600_000 : 1_400_000;
  return publicCosts;
}

function childProfile(index) {
  const mode = document.getElementById(`child${index}Mode`).value;
  if (mode === "current") return {mode, currentAge:num(`child${index}`)};
  if (mode === "future") return {mode, birthIn:num(`child${index}BirthIn`)};
  return {mode:"none"};
}

function childAgeAtYear(profile, yearOffset) {
  if (profile.mode === "current") return profile.currentAge + yearOffset;
  if (profile.mode === "future") return yearOffset - profile.birthIn;
  return -1;
}

function childStage(age) {
  if (age < 0 || age > 21) return "";
  if (age === 0) return "誕生・乳幼児";
  if (age <= 5) return "保育・幼児期";
  if (age <= 11) return age === 6 ? "小学校入学" : "小学生";
  if (age <= 14) return age === 12 ? "中学校入学" : "中学生";
  if (age <= 17) return age === 15 ? "高校入学" : "高校生";
  return age === 18 ? "大学入学" : "大学生";
}

function syncChildFields() {
  [1,2].forEach(index => {
    const mode=document.getElementById(`child${index}Mode`).value;
    document.querySelector(`.child-current-field[data-child="${index}"]`).hidden=mode!=="current";
    document.querySelector(`.child-future-field[data-child="${index}"]`).hidden=mode!=="future";
  });
}

function renderEducationSchedule() {
  const container=document.getElementById("educationSchedule");
  const parentAge=num("age"), plan=document.getElementById("education").value;
  const milestones=[{age:0,label:"誕生・乳幼児期"},{age:6,label:"小学校入学"},{age:12,label:"中学校入学"},{age:15,label:"高校入学"},{age:18,label:"大学入学"}];
  const cards=[1,2].map(index=>{
    const profile=childProfile(index);
    if(profile.mode==="none") return "";
    const currentChildAge=profile.mode==="current"?profile.currentAge:-profile.birthIn;
    const items=milestones.filter(m=>m.age>=Math.max(0,currentChildAge)).map(m=>{
      const yearsUntil=profile.mode==="current"?m.age-profile.currentAge:profile.birthIn+m.age;
      const atAge=parentAge+yearsUntil;
      return `<li><span>${yearsUntil===0?"今年":yearsUntil+"年後"}・本人${atAge}歳ごろ</span><strong>${m.label}</strong><b>年間約${yen(childCost(m.age,plan))}</b></li>`;
    }).join("");
    const start=profile.mode==="future"?`${profile.birthIn}年後に誕生予定`:`現在${profile.currentAge}歳`;
    return `<article><h4>第${index}子 <small>${start}</small></h4><ul>${items||"<li><span>入力した試算期間内の主な節目はありません</span></li>"}</ul></article>`;
  }).filter(Boolean).join("");
  container.innerHTML=cards?`<div class="schedule-heading"><strong>いつ、どんな費用がかかる？</strong><span>現在の本人年齢を基準にした概算です</span></div><div class="schedule-cards">${cards}</div>`:`<p class="schedule-empty">お子さまの予定を選ぶと、誕生から大学までの時期と費用目安が表示されます。</p>`;
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
  const bonusAnnual = num("bonusAnnual") * 10000;
  const payment = monthlyPaymentWithBonus(loan, rate, num("loanYears"), bonusAnnual);
  const monthlyRate = rate / 12;
  const totalMonths = num("loanYears") * 12;
  let loanBalance = loan;
  const initialInvestment = num("investments") * 10000;
  const initialPurchaseTotal = num("cash") * 10000 + initialInvestment - down - purchaseCosts;
  let purchaseInvestments = Math.min(initialInvestment, Math.max(0, initialPurchaseTotal));
  let purchaseCash = Math.max(0, initialPurchaseTotal - purchaseInvestments);
  let rentInvestments = initialInvestment;
  let rentCash = num("cash") * 10000;
  const inflation = pct("inflation"), investmentReturn = pct("returnRate");
  const rows = [];

  for (let y = 0; y <= years; y++) {
    const currentAge = age + y;
    const incomeFactor = Math.pow(1.01, y);
    let gross1 = num("income1") * 10000 * incomeFactor;
    let gross2 = (hasSpouse() ? num("income2") : 0) * 10000 * incomeFactor;
    if (incomeStress && y >= 3 && y < 6) { gross1 *= .7; gross2 *= .7; }
    const workingIncome = takeHome(gross1) + takeHome(gross2);
    const pensionIndex = currentAge < retireAge ? 1 : Math.pow(1 + inflation * .5, currentAge - retireAge);
    const income = currentAge < retireAge ? workingIncome : num("pension") * 10000 * pensionIndex;
    // 「毎月生活費」は現在の住居費込み。現在家賃を除いた生活費本体だけを
    // 購入・賃貸それぞれの住居費に加えることで、住居費の二重計上を防ぐ。
    const currentGrossRentMonthly = (num("rent") + num("rentFee")) * 10000;
    const currentSubsidyMonthly = num("rentSubsidyYears") > 0 ? Math.min(currentGrossRentMonthly, num("rentSubsidy") * 10000) : 0;
    const currentHousing = (currentGrossRentMonthly - currentSubsidyMonthly) * 12 + num("rentAnnual") * 10000;
    const nonHousingLiving = Math.max(0, num("living") * 120000 - currentHousing);
    const livingBase = currentAge < retireAge ? nonHousingLiving : nonHousingLiving * .70;
    const living = livingBase * Math.pow(1 + inflation, y);
    const leisure = num("leisure") * 10000 * (currentAge < retireAge ? 1 : .5) * Math.pow(1 + inflation, y);
    const childAges=[childAgeAtYear(childProfile(1),y),childAgeAtYear(childProfile(2),y)];
    const education = childAges.reduce((total,childAge)=>total+childCost(childAge,document.getElementById("education").value),0);
    const educationDetail=childAges.map((childAge,index)=>childStage(childAge)?`第${index+1}子：${childStage(childAge)}`:"").filter(Boolean).join("／");

    let annualLoan = 0;
    for (let m = 0; m < 12 && y * 12 + m < totalMonths && loanBalance > 0; m++) {
      const elapsedMonth = y * 12 + m + 1;
      const bonusPayment = elapsedMonth % 6 === 0 ? bonusAnnual / 2 : 0;
      const interestPart = loanBalance * monthlyRate;
      const scheduledPayment = payment + bonusPayment;
      const principalPart = Math.min(loanBalance, Math.max(0, scheduledPayment - interestPart));
      const actualPayment = interestPart + principalPart;
      loanBalance = Math.max(0, loanBalance - principalPart);
      annualLoan += actualPayment;
    }
    const ownerCosts = (num("maintenance") + num("parking")) * 120000 * Math.pow(1 + inflation * .5, y) + num("ownerAnnual") * 10000;
    const purchaseHousing = annualLoan + ownerCosts;
    const grossRentMonthly = (num("rent") + num("rentFee")) * 10000 * Math.pow(1 + pct("rentGrowth"), y);
    const subsidyMonthly = y < num("rentSubsidyYears") ? Math.min(grossRentMonthly, num("rentSubsidy") * 10000) : 0;
    const rentHousing = (grossRentMonthly - subsidyMonthly) * 12 + num("rentAnnual") * 10000 * Math.pow(1 + inflation, y);
    const retirementPay = currentAge === retireAge ? num("retirementPay") * 10000 : 0;
    const mortgageCredit = y >= 1 && y <= 13 ? Math.min(loanBalance, 45_000_000) * .007 : 0;
    const purchaseAnnual = income + retirementPay + mortgageCredit - living - leisure - education - purchaseHousing;
    const rentAnnual = income + retirementPay - living - leisure - education - rentHousing;
    // 利回りは投資資産にだけ適用する。預金や毎年の黒字まで
    // 自動的に全額運用され続ける前提にはしない。
    purchaseInvestments *= 1 + investmentReturn;
    rentInvestments *= 1 + investmentReturn;
    purchaseCash += purchaseAnnual;
    rentCash += rentAnnual;
    if (purchaseCash < 0) {
      const withdrawal = Math.min(purchaseInvestments, -purchaseCash);
      purchaseInvestments -= withdrawal;
      purchaseCash += withdrawal;
    }
    if (rentCash < 0) {
      const withdrawal = Math.min(rentInvestments, -rentCash);
      rentInvestments -= withdrawal;
      rentCash += withdrawal;
    }
    purchaseCash = Math.max(0, purchaseCash);
    rentCash = Math.max(0, rentCash);
    const purchaseAssets = purchaseCash + purchaseInvestments;
    const rentAssets = rentCash + rentInvestments;
    const homeValue = Math.max(price * pct("homeFloor"), price * Math.pow(1 + pct("homeGrowth"), y));
    const homeEquity = Math.max(0, homeValue * (1 - pct("saleCost")) - loanBalance);
    rows.push({age: currentAge, income, livingLeisure: living + leisure, education, educationDetail, purchaseHousing, purchaseAnnual, purchaseAssets, rentHousing, rentAnnual, rentAssets, homeValue, loanBalance, homeEquity, purchaseTotal: purchaseAssets + homeEquity, rentTotal: rentAssets});
  }

  const grossAnnual = (num("income1") + (hasSpouse() ? num("income2") : 0)) * 10000;
  const screeningRate = pct("screeningInterest");
  const priceLine = ratio => {
    // 額面年収 × 返済負担率 ÷ 12 ÷ 返済係数。
    // 返済係数は、審査金利3.3％・入力された返済期間で100万円を借りた場合の月返済額。
    const monthlyRepaymentLimit = grossAnnual * ratio / 12;
    const coefficientPerMillion = monthlyPayment(1_000_000, screeningRate, num("loanYears"));
    return coefficientPerMillion > 0 ? monthlyRepaymentLimit / coefficientPerMillion * 1_000_000 : 0;
  };
  const roomyPrice = priceLine(.30);
  const safePrice = priceLine(.35);
  const upperPrice = priceLine(.40);
  return {rows, payment, roomyPrice, safePrice, upperPrice, price, loan, down, scenario};
}

function loanBalanceAfter(principal, annualRate, totalYears, elapsedYears, annualBonus=0) {
  const payment=monthlyPaymentWithBonus(principal,annualRate,totalYears,annualBonus);
  const monthlyRate=annualRate/12;
  let balance=principal;
  const months=Math.min(totalYears*12,Math.max(0,elapsedYears*12));
  for(let month=0;month<months&&balance>0;month++){
    const interest=balance*monthlyRate;
    const bonusPayment=(month+1)%6===0?annualBonus/2:0;
    const scheduledPayment=payment+bonusPayment;
    balance=Math.max(0,balance-Math.max(0,scheduledPayment-interest));
  }
  return balance;
}

function renderTimingComparison(model) {
  const years=Math.max(1,num("waitYears"));
  const currentPrice=num("price")*10000;
  const currentDown=num("downPayment")*10000;
  const currentLoan=Math.max(0,currentPrice-currentDown);
  const currentRate=pct("interest");
  const annualBonus=num("bonusAnnual")*10000;
  const currentPayment=monthlyPaymentWithBonus(currentLoan,currentRate,num("loanYears"),annualBonus);
  const growth=pct("futurePriceGrowth");
  const futurePrice=currentPrice*Math.pow(1+growth,years);
  const futureRate=pct("futureInterest");
  const savedDuringWait=num("waitSavings")*10000*years;
  const futureDown=Math.min(futurePrice,currentDown+savedDuringWait);
  const futureLoan=Math.max(0,futurePrice-futureDown);
  const futurePayment=monthlyPaymentWithBonus(futureLoan,futureRate,num("futureLoanYears"),annualBonus);
  const currentBalance=loanBalanceAfter(currentLoan,currentRate,num("loanYears"),years,annualBonus);
  const futureHomeValue=currentPrice*Math.pow(1+growth,years);
  const currentEquity=Math.max(0,futureHomeValue*(1-pct("saleCost"))-currentBalance);
  let rentPaid=0;
  for(let year=0;year<years;year++){
    const grossMonthlyRent=(num("rent")+num("rentFee"))*10000*Math.pow(1+pct("waitRentGrowth"),year);
    const monthlySubsidy=year<num("rentSubsidyYears")?Math.min(grossMonthlyRent,num("rentSubsidy")*10000):0;
    rentPaid+=(grossMonthlyRent-monthlySubsidy)*12+num("rentAnnual")*10000*Math.pow(1+pct("inflation"),year);
  }
  const priceDiff=futurePrice-currentPrice;
  const loanDiff=futureLoan-currentLoan;
  const paymentDiff=futurePayment-currentPayment;
  const pressure=priceDiff+rentPaid;
  const timingVerdict=document.getElementById("timingVerdict");
  if(pressure>0&&paymentDiff>=0){
    timingVerdict.className="timing-verdict now-lead";
    timingVerdict.innerHTML=`<strong>この条件では、今買う方が住居費を抑えやすい試算です</strong><span>${years}年間待つと、物件価格の変化と家賃で合計約${yen(pressure)}の負担要因が生まれ、購入後の月返済も約${yen(paymentDiff)}増える想定です。</span>`;
  }else{
    timingVerdict.className="timing-verdict later-lead";
    timingVerdict.innerHTML=`<strong>この条件では、待って買う選択にも余地があります</strong><span>価格下落や頭金の増加によって、将来の借入額・月返済が抑えられる想定です。待つ間の家賃約${yen(rentPaid)}も含めて判断してください。</span>`;
  }
  document.getElementById("timingNowPrice").textContent=yen(currentPrice);
  document.getElementById("timingNowPayment").textContent=`${yen(currentPayment)}/月`;
  document.getElementById("timingNowEquityLabel").textContent=`${years}年後の住宅資産`;
  document.getElementById("timingNowEquity").textContent=yen(currentEquity);
  document.getElementById("timingLaterTitle").textContent=`${years}年後に買う場合`;
  document.getElementById("timingLaterPrice").textContent=yen(futurePrice);
  document.getElementById("timingLaterRate").textContent=`${num("futureInterest").toLocaleString("ja-JP",{maximumFractionDigits:2})}％`;
  document.getElementById("timingLaterPayment").textContent=`${yen(futurePayment)}/月`;
  document.getElementById("timingRentPaid").textContent=yen(rentPaid);
  document.getElementById("timingPriceDiff").textContent=`${priceDiff>=0?"+":""}${signedYen(priceDiff)}`;
  document.getElementById("timingPriceDiff").className=priceDiff>0?"timing-bad":"timing-good";
  document.getElementById("timingPriceDiffNote").textContent=`年${num("futurePriceGrowth")}％の想定`;
  document.getElementById("timingLoanDiff").textContent=`${loanDiff>=0?"+":""}${signedYen(loanDiff)}`;
  document.getElementById("timingLoanDiff").className=loanDiff>0?"timing-bad":"timing-good";
  document.getElementById("timingPaymentDiff").textContent=`${paymentDiff>=0?"+":""}${signedYen(paymentDiff)}/月`;
  document.getElementById("timingPaymentDiff").className=paymentDiff>0?"timing-bad":"timing-good";
  document.getElementById("timingRentImpact").textContent=yen(rentPaid);
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
  syncChildFields();
  renderEducationSchedule();
  const model = buildModel(), rows = model.rows, last = rows.at(-1);
  const shortage = rows.find(r => r.purchaseAssets === 0 && r.purchaseAnnual < 0);
  const minimum = rows.reduce((a,b)=>a.purchaseAssets<b.purchaseAssets?a:b);
  let verdict = "ゆとりを持って検討しやすい", state = "", text = "ゆとり購入ライン内の物件価格です。";
  if (model.loan <= model.roomyPrice) {
    verdict="ゆとりを持って検討しやすい";
    text=`借入額${yen(model.loan)}は、額面年収30％のゆとり借入ライン内です。`;
  } else if (model.loan <= model.safePrice) {
    verdict="安心して検討しやすい";
    text=`借入額${yen(model.loan)}は、額面年収35％の安心借入ライン内です。`;
  } else if (model.loan <= model.upperPrice) {
    verdict="条件を確認しながら検討";
    state="warning";
    text=`借入額${yen(model.loan)}は、額面年収40％の借入検討上限ライン内です。`;
  } else {
    verdict="購入条件の見直しをおすすめ";
    state="danger";
    text=`借入額${yen(model.loan)}が借入検討上限ラインを超えています。自己資金や物件価格をご確認ください。`;
  }
  const card=document.getElementById("verdictCard");card.className=`verdict-card ${state}`;document.getElementById("verdict").textContent=verdict;document.getElementById("verdictText").textContent=text;
  const scenarioNames={standard:"標準シナリオ",rate:"金利上昇シナリオ",income:"収入減少シナリオ",combined:"複合シナリオ"};document.getElementById("scenarioChip").textContent=scenarioNames[model.scenario];
  document.getElementById("metricPrice").textContent=yen(model.price);document.getElementById("metricLoan").textContent=`借入額 ${yen(model.loan)}（自己資金 ${yen(model.down)}）`;document.getElementById("metricRoomy").textContent=yen(model.roomyPrice);document.getElementById("metricSafe").textContent=yen(model.safePrice);document.getElementById("metricUpper").textContent=yen(model.upperPrice);document.getElementById("metricPayment").textContent=`${yen(model.payment)}/月`;document.getElementById("metricMinimum").textContent=`${signedYen(minimum.purchaseAssets)}（${minimum.age}歳）`;
  const screeningRateLabel = num("screeningInterest").toLocaleString("ja-JP", {maximumFractionDigits:2});
  document.getElementById("roomyRule").textContent=`額面年収30％・審査金利${screeningRateLabel}％／自己資金込み物件目安 ${yen(model.roomyPrice+model.down)}`;
  document.getElementById("safeRule").textContent=`額面年収35％・審査金利${screeningRateLabel}％／自己資金込み物件目安 ${yen(model.safePrice+model.down)}`;
  document.getElementById("upperRule").textContent=`額面年収40％・審査金利${screeningRateLabel}％／自己資金込み物件目安 ${yen(model.upperPrice+model.down)}`;
  const badge=document.getElementById("shortageBadge");badge.textContent=shortage?`${shortage.age}歳ごろに手元資金を確認`:`${num("endAge")}歳までプラス`;badge.className=shortage?"warning":"";
  document.getElementById("assetExplanation").innerHTML=shortage?`<strong>収支確認の目安</strong><br>${shortage.age}歳ごろに手元資金が0円となる試算です。マイナス資産としては累積せず、赤字になる年度は「生涯収支」で確認できます。`:`<strong>手元資金について</strong><br>${num("endAge")}歳まで、預貯金・投資資産を維持できる試算です。`;
  const presentValue=(value,yearOffset)=>value/Math.pow(1+pct("inflation"),yearOffset);
  const finalYearOffset=last.age-num("age");
  const buyTotalPresent=presentValue(last.purchaseTotal,finalYearOffset);
  const rentTotalPresent=presentValue(last.rentTotal,finalYearOffset);
  const buyCashPresent=presentValue(last.purchaseAssets,finalYearOffset);
  const buyHomePresent=presentValue(last.homeEquity,finalYearOffset);
  const rentCashPresent=presentValue(last.rentAssets,finalYearOffset);
  document.getElementById("buyTotal").textContent=yen(buyTotalPresent);
  document.getElementById("rentTotal").textContent=signedYen(rentTotalPresent);
  document.getElementById("buyCash").textContent=signedYen(buyCashPresent);
  document.getElementById("buyHome").textContent=yen(buyHomePresent);
  document.getElementById("rentCash").textContent=signedYen(rentCashPresent);
  const finalDifference=buyTotalPresent-rentTotalPresent;
  const comparisonAnswer=document.getElementById("comparisonAnswer");
  if(Math.abs(finalDifference)<1){
    comparisonAnswer.innerHTML=`<strong>${last.age}歳時点では、ほぼ同じ結果です</strong><span>購入と賃貸で、将来残る金額の差はほとんどありません。</span>`;
  }else if(finalDifference>0){
    comparisonAnswer.innerHTML=`<strong>${last.age}歳時点では、購入した場合が約${yen(Math.abs(finalDifference))}多く残る試算です</strong><span>ただし、購入側にはすぐ使えない「家の価値」も含まれます。</span>`;
  }else{
    comparisonAnswer.innerHTML=`<strong>${last.age}歳時点では、賃貸を続けた場合が約${yen(Math.abs(finalDifference))}多く残る試算です</strong><span>購入価格、家賃、売却時の家の価値によって結果は変わります。</span>`;
  }
  comparisonAnswer.className=`comparison-answer ${finalDifference>=0?'buy-lead':'rent-lead'}`;
  const ages=[65,75,85,num("endAge")].filter((v,i,list)=>v>=num("age")&&v<=num("endAge")&&list.indexOf(v)===i);
  document.getElementById("compareTable").innerHTML=ages.map(ageValue=>{const r=rows.find(x=>x.age===ageValue)||last;const offset=r.age-num("age");const cash=presentValue(r.purchaseAssets,offset);const home=presentValue(r.homeEquity,offset);const total=presentValue(r.purchaseTotal,offset);const rent=presentValue(r.rentAssets,offset);const diff=total-rent;return `<tr><td>${ageValue}歳</td><td>${signedYen(cash)}</td><td>${yen(home)}</td><td>${signedYen(total)}</td><td>${signedYen(rent)}</td><td class="${diff<0?'negative':'positive'}">${diff>=0?'+':''}${signedYen(diff)}</td></tr>`}).join("");
  renderTimingComparison(model);
  document.getElementById("cashflowTable").innerHTML=rows.map(r=>{
    const isShortage=r.purchaseAnnual<0&&r.purchaseAssets===0;
    const balanceClass=r.purchaseAnnual>=0?'positive':isShortage?'negative':'drawdown';
    const balanceText=r.purchaseAnnual>=0?`+${yen(r.purchaseAnnual)}`:isShortage?`不足 ${yen(Math.abs(r.purchaseAnnual))}`:`資産から ${yen(Math.abs(r.purchaseAnnual))} 補填`;
    return `<tr><td>${r.age}歳</td><td>${yen(r.income)}</td><td>${yen(r.livingLeisure)}</td><td class="education-stage">${r.educationDetail||"—"}</td><td class="${r.education>0?'education-cost':''}">${yen(r.education)}</td><td>${yen(r.purchaseHousing)}</td><td class="${balanceClass}">${balanceText}</td><td>${signedYen(r.purchaseAssets)}</td></tr>`;
  }).join("");
  requestAnimationFrame(()=>{drawChart(document.getElementById("assetChart"),rows,[{label:"手元の金融資産",color:"#2f75b5",get:r=>r.purchaseAssets}]);drawChart(document.getElementById("compareChart"),rows,[{label:"買った場合に残る合計（現在価値）",color:"#2f75b5",get:r=>presentValue(r.purchaseTotal,r.age-num("age"))},{label:"賃貸で手元に残るお金（現在価値）",color:"#7f8fa6",get:r=>presentValue(r.rentTotal,r.age-num("age"))}])});
}

let timer; ids.forEach(id=>{const element=document.getElementById(id);const update=()=>{if(id==="spouseStatus")syncSpouseFields();if(id.includes("child"))syncChildFields();clearTimeout(timer);timer=setTimeout(render,60)};element.addEventListener("input",update);if(element.tagName==="SELECT")element.addEventListener("change",update)});
document.querySelectorAll(".tab").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".tab,.tab-panel").forEach(x=>x.classList.remove("active"));button.classList.add("active");document.getElementById(button.dataset.tab).classList.add("active");render()}));
document.querySelectorAll(".help").forEach(button=>button.addEventListener("click",e=>{e.preventDefault();showToast(button.dataset.help)}));
document.getElementById("savePlanButton").addEventListener("click",saveCurrentPlan);
document.getElementById("loadPlanButton").addEventListener("click",loadSelectedPlan);
document.getElementById("deletePlanButton").addEventListener("click",deleteSelectedPlan);
document.getElementById("saveName").addEventListener("keydown",event=>{if(event.key==="Enter") saveCurrentPlan()});
document.getElementById("timingPresetButton").addEventListener("click",()=>{
  document.getElementById("waitYears").value=5;
  document.getElementById("futurePriceGrowth").value=2.0;
  document.getElementById("futureInterest").value=(num("interest")+0.5).toFixed(1);
  document.getElementById("futureLoanYears").value=Math.max(1,num("loanYears")-5);
  document.getElementById("waitSavings").value=100;
  document.getElementById("waitRentGrowth").value=1.0;
  render();
});
function preparePrintCharts() {
  document.body.classList.add("printing");
  render();
}
function restoreScreenCharts() {
  document.body.classList.remove("printing");
  render();
}
document.getElementById("printButton").addEventListener("click",()=>{
  preparePrintCharts();
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
});
window.addEventListener("beforeprint",preparePrintCharts);
window.addEventListener("afterprint",restoreScreenCharts);
document.getElementById("resetButton").addEventListener("click",()=>{ids.forEach(id=>document.getElementById(id).value=initial[id]);syncSpouseFields();render()});
window.addEventListener("resize",()=>{clearTimeout(timer);timer=setTimeout(render,120)});
syncSpouseFields();
syncChildFields();
refreshSavedPlanSelect();
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
