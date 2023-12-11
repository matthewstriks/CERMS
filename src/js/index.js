let loadingTxt = document.getElementById('loadingTxt')
let progressBar = document.getElementById('progressBar')

if (progressBar) {
  ipcRenderer.send('getClient')
}

ipcRenderer.on('send-loading-progress', (event, arg) => {
  loadingTxt.innerHTML = arg[2]
  thePercent = (arg[1] / arg[0]) * 100;
  progressBar.style="width: "+thePercent+"%;";
  progressBar.ariaValueNow=thePercent;
  progressBar.innerHTML = Math.round(thePercent) + '%';
})
