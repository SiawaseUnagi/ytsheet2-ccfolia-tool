/** Static help for effect sources; no character-sheet content is inserted as HTML. */
export function mountInventoryHelp(): void {
  const help = document.getElementById("usageInstructions");
  if (!help || document.getElementById("inventoryCorrectionHelp")) return;
  const section = document.createElement("section"); section.id = "inventoryCorrectionHelp";
  section.innerHTML = `<h4>アイテム・装備の補正</h4>
<p>装備欄の備考と、アイテム欄の5列表（名前｜個数｜効果｜説明｜重量）の「効果」から、ダメージ・判定・スキルの回復量などに加える補正を読み取ります。「消耗品」と書かれていない道具も対象です。候補には「アイテム」「装備」を表示します。名前だけの記入から、効果を推測して補うことはありません。</p>
<p>所持数0の品は補正候補に加えません。同じ品を複数持っていても、個数を補正値に掛けません。装備欄とアイテム欄に同名の品がある場合は装備欄を優先し、効果文が異なる場合は要確認として表示します。</p>
<p>装備欄のパッシブは常時加算、使用タイミングがある効果はフラグ管理を初期値にします。アイテム欄では、所持者に有効と明記された無条件のパッシブを常時加算にし、消耗品・未装備の装備品・条件付きの効果はフラグ管理にします。適用条件を原文で確認し、必要に応じて選び直してください。</p>
<p>消耗品の所持数と、補正のオン・オフは別のステータスで管理します。所持数3個を「補正3倍」として扱うことはありません。強心丹の精神判定+1Dは既存の <code>強心丹D</code> を使い、補正候補に重複させません。</p>
<p>自動で確定できない式や、ポーションなど特定のアイテムの回復量だけに効く補正は「要確認」に表示します。スキルの回復量へ混ぜず、該当する式を手入力で調整してください。ゆとシートの合計値に反映済みの補正は、二重加算を避けるためチェックを外してください。</p>`;
  const next = [...help.querySelectorAll("h3")].find(node => node.textContent === "データの保存と更新");
  if (next) next.before(section); else help.append(section);
}
