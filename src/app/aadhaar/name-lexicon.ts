// Common name words in Andhra Pradesh / Telangana, as spelled on Aadhaar cards. OCR on phone
// photos often merges letters ("ri" read as "n", "rn" as "m"), so a word that is one or two
// edits away from exactly one of these is corrected to it.
const WORDS = `
aadhya abhinav abhishek aditya akhil akash akhila amar amaravathi amrutha anand ananth anil anitha anjali anjaneyulu anjaiah
ankitha annapurna anu anusha anvesh appa appala appalanaidu aravind archana arjun aruna arun ashok asha aswini avinash
babu babji bala balakrishna balaji balaraju bhanu bharath bharathi bhaskar bhargav bhargavi bhavani bhavya bhupal
chaitanya chakravarthi chalapathi chandra chandrasekhar chandrika charan chinna chiranjeevi chittibabu
damodar dasaradha deepa deepak deepika devi devendra dhana dhanalakshmi dhanunjaya dharani dileep dinesh divya durga durgaprasad
eswar eswaramma eswari
ganesh ganga gangadhar gayathri geetha girija girish gopal gopi gopikrishna govind govinda govindamma govindu gowri gowtham guravaiah guru
haritha harika harish hari harikrishna haribabu hema hemalatha hemanth
indira indu
jagadeesh jagan janaki jaya jayamma jayaram jayasree jhansi jyothi
kalpana kalyan kalyani kamala kamalamma kanaka kanakaiah karthik karthikeya kavitha kavya keerthi kesava kiran kishore kokila krishna krishnaiah krishnamurthy krishnaveni kumar kumari kusuma
lakshmaiah lakshmamma lakshman lakshmi lalitha lalithamma latha lavanya leela lokesh
madhavi madhu madhuri mahalakshmi mahesh malathi malli mallika mallikarjuna mamatha manasa mani manikanta manjula manoj meena mohan mounika mounish mukesh murali muralidhar muni munirathnam muniratnam muniswamy murthy
naga nagaraju nagamani nagarjuna nageswara nageswararao nagendra naidu nandini narasimha narasimhulu narayana narayanamma naresh naveen navya neelima nirmala nitin
padma padmavathi pallavi pavan pavani poojitha prabhakar pradeep praveen prasad prasanna prasanth pratap preetham preethi priya priyanka purushotham pushpa
radha radhika raghava raghu raghavendra rahul raja rajesh rajeswari raju rakesh rama ramadevi ramakrishna ramana ramanaiah ramesh ramu rani ranjith rao rathnam ravi ravindra reddy renuka reshma revathi rohith roja rukmini rupa
sai saikumar saikrishna sairam sandhya sandeep sangeetha sanjay santhosh santhi saraswathi sarath saritha sarojamma sasi sasikala satish satya satyanarayana savithri seetha sekhar shankar sharmila shiva shravani siddharth siva sivaiah sivakumar sivaprasad sneha sobha sowjanya sravani sravan sree sreedevi sreenivasulu sri sridevi sridhar srikanth srinivas srinivasa srinivasulu subba subbaiah subbamma subbarao subbarayudu subramanyam sudha sudhakar sudheer suguna sujatha sumalatha suman sumathi sunil sunitha suneetha surekha suresh surya susheela swapna swathi swetha
tejaswini thirupathi thulasi tirumala tirupathi tulasi
uday uma umamaheswari usha
vaishnavi vamsi vani varalakshmi varun vasantha vasu vasudeva venkata venkatesh venkateswarlu venkateswara venkatamma venkataramana venkataiah venu venugopal vidya vijay vijaya vijayalakshmi vijayamma vikram vimala vinay vinod vishnu vasundhara
yamini yashoda yasodha yadagiri yesu
`
  .split(/\s+/)
  .filter(Boolean);

const KNOWN = new Set(WORDS);

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Undo, one place at a time, the letter merges OCR typically makes ("ri" read as "n", ...). */
function variants(word: string): string[] {
  const out = new Set([word]);
  const swaps: [string, string][] = [['n', 'ri'], ['m', 'rn'], ['rn', 'm'], ['cl', 'd'], ['li', 'h'], ['ii', 'u']];
  for (const [from, to] of swaps)
    for (let i = word.indexOf(from); i >= 0; i = word.indexOf(from, i + 1)) out.add(word.slice(0, i) + to + word.slice(i + from.length));
  return [...out];
}

/** How many words of a name are known name words; used to choose between two readings. */
export function knownWords(name: string): number {
  return name.toLowerCase().split(/\s+/).filter(w => KNOWN.has(w)).length;
}

/**
 * Corrects one OCR word that is not a known name word, using its OCR confidence (0-100):
 *  - undoing a typical letter merge gives exactly a known word ("Knshna" -> "Krishna"): below 92;
 *  - one other edit away from exactly one known word: only below 80.
 * Clean, confident readings of genuine rare spellings are never changed.
 */
export function correctNameWord(raw: string, confidence: number): string {
  const w = raw.toLowerCase().replace(/\.$/, '');
  if (w.length < 4 || KNOWN.has(w) || confidence >= 92) return raw;
  const styled = (k: string) => (raw === raw.toUpperCase() ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));

  const merged = variants(w).filter(v => v !== w && KNOWN.has(v));
  if (merged.length === 1) return styled(merged[0]);
  if (confidence >= 80) return raw;

  let best: string | null = null;
  let bestD = Infinity;
  let tie = false;
  for (const k of WORDS) {
    if (Math.abs(k.length - w.length) > 2) continue;
    const d = Math.min(...variants(w).map(v => distance(v, k)));
    if (d < bestD) [best, bestD, tie] = [k, d, false];
    else if (d === bestD && k !== best) tie = true;
  }
  return best && bestD <= 1 && !tie ? styled(best) : raw;
}
