document.addEventListener("DOMContentLoaded", function () {
    fetch("https://api.github.com/repos/matthewstriks/CERMS/releases/tags/v3.1.2")
        .then(response => response.json())
        .then(data => {
            const changelogContainer = document.getElementById("changelog");
            const changelogBody = data.body;

            changelogContainer.innerHTML = marked.parse(changelogBody);

            // Create confetti
            createConfetti();
        })
        .catch(error => console.error('Error fetching the changelog:', error));
});

function createConfetti() {
    for (let i = 0; i < 100; i++) {       
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = getRandomColor();
        confetti.style.animationDuration = Math.random() * 3 + 3 + 's';
        document.body.appendChild(confetti);
    }
}

function getRandomColor() {
    const colors = ['#ff0d00', '#ff9e00', '#ffff00', '#04ff00', '#00ffe7', '#007eff', '#ff00f7'];
    return colors[Math.floor(Math.random() * colors.length)];
}

document.getElementById('closeBtn').addEventListener('click', function(){
    window.close(); 
})