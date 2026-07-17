// ツールバーアイコンでサイドパネルを開く（外クリックでは閉じない）
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
