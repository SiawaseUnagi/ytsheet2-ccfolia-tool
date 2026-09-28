// Synthetic inputs for the four handoff requests, not a rules database or a real character.
const skill = (name, effect, extra = {}) => ({
  name, effect, lv: "1", timing: "セットアップ", judge: "自動成功",
  target: "自身", range: "―", cost: "3", usage: "―", ...extra,
});
module.exports = {
  ...require("./calculation-fixture.cjs"),
  id: "handofftest",
  characterName: "引き継ぎ合成テスト",
  level: "3",
  hpTotal: "40",
  mpTotal: "50",
  fateTotal: "5",
  sheetURL: "https://yutorize.work/ytsheet/ar2e/?id=handofftest",
  armamentOtherName: "",
  armamentOtherNote: "",
  items: "|試験ポーション|3|マイナー、メジャー。使用者の【HP】を[2D]点回復する。消耗品。|合成データ|@[1*3]|",
  skill: [
    skill("イメージボディ", "回避判定の達成値に+[SL×2]する。"),
    skill("全判定テスト", "すべての判定の達成値に+[SL+2]する。この効果はシーン終了まで持続する。", { usage: "シナリオSL回" }),
    skill("全ダイステスト", "あらゆるダイスロールに+1Dする。この効果はシーン終了まで持続する。"),
    skill("ドッジムーブ", "回避判定と同時に使用する。回避判定の達成値に+[SL+2]する。", { timing: "効果参照" }),
    skill("ベアアップ", "スキルに対するリアクションとして行う精神判定に+1Dする。", { timing: "パッシブ" }),
    skill("反応テスト", "これは配置を確認する合成データ。", { timing: "リアクション", judge: "敏捷" }),
    skill("固定攻撃テスト", "武器攻撃のダメージに+[SL×2]する。", { timing: "パッシブ" }),
  ],
};
