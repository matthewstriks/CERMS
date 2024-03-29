ipcRenderer.send('uploadProductImg')

let theProductID;
let firebaseConfig

var files = [];
document.getElementById("files").addEventListener("change", function (e) {
    files = e.target.files;
    for (let i = 0; i < files.length; i++) {
        console.log(files[i]);
        console.log(files[i].type.replace(/(.*)\//g, ''))
    }
});

document.getElementById("send").addEventListener("click", function () {
    if (files.length != 0) {
        for (let i = 0; i < files.length; i++) {
            var storage = firebase.storage().ref('/product-images/' + files[i].name);
            var upload = storage.put(files[i]);

            upload.on(
                "state_changed",
                function progress(snapshot) {
                    var percentage = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    document.getElementById("progress").innerHTML = percentage + '%';
                    document.getElementById("progress").setAttribute('style', "width: " + percentage + "%;");
                    document.getElementById("progress").setAttribute('aria-valuenow', percentage);
//                    document.getElementById("progress").value = percentage;
                },

                function error() {
                    alert("error uploading file");
                },

                function complete() {
                    document.getElementById(
                        "uploading"
                    ).innerHTML += `${files[i].name} uploaded <br />`;
                    getFileUrl('/product-images/' + files[i].name)
                }
            );
        }
    } else {
        alert("No file chosen");
    }
});

function getFileUrl(filename) {
    var storage = firebase.storage().ref(filename);

    storage
    .getDownloadURL()
    .then(function (url) {
        ipcRenderer.send('uploadProductImg-complete', Array(theProductID, url))
    })
    .catch(function (error) {
        console.log("error encountered");
    });
}

ipcRenderer.on('uploadProductImg-return', (event, arg) => {
    firebaseConfig = arg[0]
    firebase.initializeApp(firebaseConfig);

    document.getElementById('pTxt').innerHTML = 'Upload Image for product ID: ' + arg[1]

    theProductID = arg[1]
})
