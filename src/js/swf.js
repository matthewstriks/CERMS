let closeBtn = document.getElementById('closeBtn')

console.log('working2');

if (closeBtn) {
    closeBtn.addEventListener('click', function(){
        console.log('yo sending');
    })


    closeBtn.addEventListener('click', function(){
        console.log('sending');
        ipcRenderer.send('close-swf-window')
    })    
}
