let githubLink = document.getElementById('githubLink')

if (githubLink) {
  githubLink.addEventListener('click', function(){
    ipcRenderer.send('github-link')
  })
}