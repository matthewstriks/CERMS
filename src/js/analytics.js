const { ipcRenderer } = require('electron')
const { Chart, LogarithmicScale } = require('chart.js/auto');
let startTime = document.getElementById('startTime')
let endTime = document.getElementById('endTime')
let runAnalytics = document.getElementById('runAnalytics')
let analyticsTabs = document.getElementById('analyticsTabs')
let tnomLbl = document.getElementById('tnomLbl')

let productInventoryDocChart = document.getElementById('productInventoryChart')
let productSalesDocChart = document.getElementById('productSalesChart')

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (document.getElementById('quickSaleBtn')) {
  document.getElementById('quickSaleBtn').addEventListener('click', function () {
    ipcRenderer.send('quick-sale')
  })
}

if (analyticsTabs) {
  analyticsTabs.style.display = 'none';
}

let tnomLblAmt = 0;

let odpMemberships = 0;
let gMemberships = 0;

let janNum = 0;
let febNum = 0;
let marNum = 0;
let aprNum = 0;
let mayNum = 0;
let junNum = 0;
let julNum = 0;
let augNum = 0;
let sepNum = 0;
let octNum = 0;
let novNum = 0;
let decNum = 0;

let membershipTypes = Array()
let membershipTypesColor = Array()
let membershipTypesData = Array()

let productNames = Array()
let productInventory = Array()
let productInventoryColor = Array()
let productSales = Array()
let productSalesLbl = Array()
let productSalesDta = Array()
let productSalesColor = Array()

let g12a = 0;
let g1a = 0;
let g2a = 0;
let g3a = 0;
let g4a = 0;
let g5a = 0;
let g6a = 0;
let g7a = 0;
let g8a = 0;
let g9a = 0;
let g10a = 0;
let g11a = 0;
let g12p = 0;
let g1p = 0;
let g2p = 0;
let g3p = 0;
let g4p = 0;
let g5p = 0;
let g6p = 0;
let g7p = 0;
let g8p = 0;
let g9p = 0;
let g10p = 0;
let g11p = 0;

let g12at = 0;
let g1at = 0;
let g2at = 0;
let g3at = 0;
let g4at = 0;
let g5at = 0;
let g6at = 0;
let g7at = 0;
let g8at = 0;
let g9at = 0;
let g10at = 0;
let g11at = 0;
let g12pt = 0;
let g1pt = 0;
let g2pt = 0;
let g3pt = 0;
let g4pt = 0;
let g5pt = 0;
let g6pt = 0;
let g7pt = 0;
let g8pt = 0;
let g9pt = 0;
let g10pt = 0;
let g11pt = 0;

let g12aw = 0;
let g1aw = 0;
let g2aw = 0;
let g3aw = 0;
let g4aw = 0;
let g5aw = 0;
let g6aw = 0;
let g7aw = 0;
let g8aw = 0;
let g9aw = 0;
let g10aw = 0;
let g11aw = 0;
let g12pw = 0;
let g1pw = 0;
let g2pw = 0;
let g3pw = 0;
let g4pw = 0;
let g5pw = 0;
let g6pw = 0;
let g7pw = 0;
let g8pw = 0;
let g9pw = 0;
let g10pw = 0;
let g11pw = 0;

let g12am = 0;
let g1am = 0;
let g2am = 0;
let g3am = 0;
let g4am = 0;
let g5am = 0;
let g6am = 0;
let g7am = 0;
let g8am = 0;
let g9am = 0;
let g10am = 0;
let g11am = 0;
let g12pm = 0;
let g1pm = 0;
let g2pm = 0;
let g3pm = 0;
let g4pm = 0;
let g5pm = 0;
let g6pm = 0;
let g7pm = 0;
let g8pm = 0;
let g9pm = 0;
let g10pm = 0;
let g11pm = 0;

let odp12a = 0;
let odp1a = 0;
let odp2a = 0;
let odp3a = 0;
let odp4a = 0;
let odp5a = 0;
let odp6a = 0;
let odp7a = 0;
let odp8a = 0;
let odp9a = 0;
let odp10a = 0;
let odp11a = 0;
let odp12p = 0;
let odp1p = 0;
let odp2p = 0;
let odp3p = 0;
let odp4p = 0;
let odp5p = 0;
let odp6p = 0;
let odp7p = 0;
let odp8p = 0;
let odp9p = 0;
let odp10p = 0;
let odp11p = 0;

let odp12at = 0;
let odp1at = 0;
let odp2at = 0;
let odp3at = 0;
let odp4at = 0;
let odp5at = 0;
let odp6at = 0;
let odp7at = 0;
let odp8at = 0;
let odp9at = 0;
let odp10at = 0;
let odp11at = 0;
let odp12pt = 0;
let odp1pt = 0;
let odp2pt = 0;
let odp3pt = 0;
let odp4pt = 0;
let odp5pt = 0;
let odp6pt = 0;
let odp7pt = 0;
let odp8pt = 0;
let odp9pt = 0;
let odp10pt = 0;
let odp11pt = 0;

let odp12aw = 0;
let odp1aw = 0;
let odp2aw = 0;
let odp3aw = 0;
let odp4aw = 0;
let odp5aw = 0;
let odp6aw = 0;
let odp7aw = 0;
let odp8aw = 0;
let odp9aw = 0;
let odp10aw = 0;
let odp11aw = 0;
let odp12pw = 0;
let odp1pw = 0;
let odp2pw = 0;
let odp3pw = 0;
let odp4pw = 0;
let odp5pw = 0;
let odp6pw = 0;
let odp7pw = 0;
let odp8pw = 0;
let odp9pw = 0;
let odp10pw = 0;
let odp11pw = 0;

let odp12am = 0;
let odp1am = 0;
let odp2am = 0;
let odp3am = 0;
let odp4am = 0;
let odp5am = 0;
let odp6am = 0;
let odp7am = 0;
let odp8am = 0;
let odp9am = 0;
let odp10am = 0;
let odp11am = 0;
let odp12pm = 0;
let odp1pm = 0;
let odp2pm = 0;
let odp3pm = 0;
let odp4pm = 0;
let odp5pm = 0;
let odp6pm = 0;
let odp7pm = 0;
let odp8pm = 0;
let odp9pm = 0;
let odp10pm = 0;
let odp11pm = 0;

function createCharts(){
  const membersPerMonthChartDoc = document.getElementById('membersPerMonthChart');
  const membersPerMonthChart = new Chart(membersPerMonthChartDoc, {
      type: 'bar',
      data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [{
              label: "# of signup's per month",
              data: [janNum, febNum, marNum, aprNum, mayNum, junNum, julNum, augNum, sepNum, octNum, novNum, decNum],
              backgroundColor: productInventoryColor,
              borderWidth: 1
          }]
      },
      options: {
          scales: {
              y: {
                  beginAtZero: true
              }
          }
      }
  });

  const membershipTypesChartDoc = document.getElementById('membershipTypesChart');
  const membershipTypesChart = new Chart(membershipTypesChartDoc, {
      type: 'doughnut',
      data: {
        labels: membershipTypes,
        datasets: [{
          label: "Memberships",
          backgroundColor: membershipTypesColor,
          data: membershipTypesData
        }]
      },
      options: {
        responsive: false
      }
  });

  const checkInTimeChartDoc = document.getElementById('checkInTimeChart');
  const checkInTimeChart = new Chart(checkInTimeChartDoc, {
    type: 'line',
    data: {
      labels: ['12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'],
      datasets: [{
          data: [g12a, g1a, g2a, g3a, g4a, g5a, g6a, g7a, g8a, g9a, g10a, g11a, g12p, g1p, g2p, g3p, g4p, g5p, g6p, g7p, g8p, g9p, g10p, g11p],
          label: "Gold",
          borderColor: "#ffde00",
          fill: false
        }, {
          data: [odp12a, odp1a, odp2a, odp3a, odp4a, odp5a, odp6a, odp7a, odp8a, odp9a, odp10a, odp11a, odp12p, odp1p, odp2p, odp3p, odp4p, odp5p, odp6p, odp7p, odp8p, odp9p, odp10p, odp11p],
          label: "One-day Pass",
          borderColor: "#8e5ea2",
          fill: false
        }
      ]
    },
    options: {
      responsive: false,
      title: {
        display: true,
        text: 'World population per region (in millions)'
      }
    }
  });

  const checkInTimeChartDocToday = document.getElementById('checkInTimeChartToday');
  const checkInTimeChartToday = new Chart(checkInTimeChartDocToday, {
    type: 'line',
    data: {
      labels: ['12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'],
      datasets: [{
          data: [g12at, g1at, g2at, g3at, g4at, g5at, g6at, g7at, g8at, g9at, g10at, g11at, g12pt, g1pt, g2pt, g3pt, g4pt, g5pt, g6pt, g7pt, g8pt, g9pt, g10pt, g11pt],
          label: "Gold",
          borderColor: "#ffde00",
          fill: false
        }, {
          data: [odp12at, odp1at, odp2at, odp3at, odp4at, odp5at, odp6at, odp7at, odp8at, odp9at, odp10at, odp11at, odp12pt, odp1pt, odp2pt, odp3pt, odp4pt, odp5pt, odp6pt, odp7pt, odp8pt, odp9pt, odp10pt, odp11pt],
          label: "One-day Pass",
          borderColor: "#8e5ea2",
          fill: false
        }
      ]
    },
    options: {
      responsive: false,
      title: {
        display: true,
        text: 'World population per region (in millions)'
      }
    }
  });

  const checkInTimeChartDocWeek = document.getElementById('checkInTimeChartWeek');
  const checkInTimeChartWeek = new Chart(checkInTimeChartDocWeek, {
    type: 'line',
    data: {
      labels: ['12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'],
      datasets: [{
          data: [g12aw, g1aw, g2aw, g3aw, g4aw, g5aw, g6aw, g7aw, g8aw, g9aw, g10aw, g11aw, g12pw, g1pw, g2pw, g3pw, g4pw, g5pw, g6pw, g7pw, g8pw, g9pw, g10pw, g11pw],
          label: "Gold",
          borderColor: "#ffde00",
          fill: false
        }, {
          data: [odp12aw, odp1aw, odp2aw, odp3aw, odp4aw, odp5aw, odp6aw, odp7aw, odp8aw, odp9aw, odp10aw, odp11aw, odp12pw, odp1pw, odp2pw, odp3pw, odp4pw, odp5pw, odp6pw, odp7pw, odp8pw, odp9pw, odp10pw, odp11pw],
          label: "One-day Pass",
          borderColor: "#8e5ea2",
          fill: false
        }
      ]
    },
    options: {
      responsive: false,
      title: {
        display: true,
        text: 'World population per region (in millions)'
      }
    }
  });

  const checkInTimeChartDocMonth = document.getElementById('checkInTimeChartMonth');
  const checkInTimeChartMonth = new Chart(checkInTimeChartDocMonth, {
    type: 'line',
    data: {
      labels: ['12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'],
      datasets: [{
          data: [g12am, g1am, g2am, g3am, g4am, g5am, g6am, g7am, g8am, g9am, g10am, g11am, g12pm, g1pm, g2pm, g3pm, g4pm, g5pm, g6pm, g7pm, g8pm, g9pm, g10pm, g11pm],
          label: "Gold",
          borderColor: "#ffde00",
          fill: false
        }, {
          data: [odp12am, odp1am, odp2am, odp3am, odp4am, odp5am, odp6am, odp7am, odp8am, odp9am, odp10am, odp11am, odp12pm, odp1pm, odp2pm, odp3pm, odp4pm, odp5pm, odp6pm, odp7pm, odp8pm, odp9pm, odp10pm, odp11pm],
          label: "One-day Pass",
          borderColor: "#8e5ea2",
          fill: false
        }
      ]
    },
    options: {
      responsive: false,
      title: {
        display: true,
        text: 'World population per region (in millions)'
      }
    }
  });

  const productInventoryChart = new Chart(productInventoryDocChart, {
    type: 'bar',
    data: {
      labels: productNames,
      datasets: [{
        label: "# of inventory",
        data: productInventory,
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(255, 206, 86, 0.2)',
          'rgba(75, 192, 192, 0.2)',
          'rgba(153, 102, 255, 0.2)',
          'rgba(255, 159, 64, 0.2)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  const productSalesChart = new Chart(productSalesDocChart, {
    type: 'doughnut',
    data: {
      labels: productSalesLbl,
      datasets: [{
        label: "Memberships",
        backgroundColor: productSalesColor,
        data: productSalesDta
      }]
    },
    options: {
      responsive: false
    }
  });

}

if(runAnalytics){
  runAnalytics.addEventListener('click', function(){
    ipcRenderer.send('analytics-run', Array(startTime.value || false, endTime.value || false))
  })
}

ipcRenderer.on('analytics-return', async (event, arg) => {
  await arg[0].forEach((item, i) => {
    tnomLblAmt ++;
    tnomLbl.innerHTML = '<b>Total number of members: </b>'+tnomLblAmt;
    let theCurrMembership = arg[0][i][1];
    let theCreationTime = theCurrMembership.creation_time.seconds;
    if (!theCurrMembership.creation_time.seconds) {
      theCreationTime = theCurrMembership.creation_time;
    }
    let theDate = new Date(theCreationTime*1000);
    let theMonth = theDate.getMonth()+1;
    let theYear = theDate.getYear();
    let theHours = theDate.getHours();
    var current = new Date();
    let ctheMonth = current.getMonth()+1;
    let ctheYear = current.getYear();
    let tDate = current.toLocaleDateString();
    let tDate2 = theDate.toLocaleDateString();
    let isToday = false;
    let isWeek = false;
    let isMonth = false;
    let isYear = false;

    let startDate = new Date(current.getFullYear(), 0, 1);
    let startDate2 = new Date(theDate.getFullYear(), 0, 1);
    var days = Math.floor((current - startDate) /
        (24 * 60 * 60 * 1000));
    var days2 = Math.floor((theDate - startDate2) /
        (24 * 60 * 60 * 1000));

    var weekNumber = Math.ceil(days / 7);
    var weekNumber2 = Math.ceil(days2 / 7);

    if (tDate == tDate2) {
      isToday = true;
    }

    if (weekNumber == weekNumber2) {
      isWeek = true;
    }

    if (theMonth == ctheMonth && theYear == ctheYear) {
      isMonth = true;
    }

    if (theMonth == 1) {
      janNum ++;
    }else if (theMonth == 2) {
      febNum ++;
    }else if (theMonth == 3) {
      marNum ++;
    }else if (theMonth == 4) {
      aprNum ++;
    }else if (theMonth == 5) {
      mayNum ++;
    }else if (theMonth == 6) {
      junNum ++;
    }else if (theMonth == 7) {
      julNum ++;
    }else if (theMonth == 8) {
      augNum ++;
    }else if (theMonth == 9) {
      sepNum ++;
    }else if (theMonth == 10) {
      octNum ++;
    }else if (theMonth == 11) {
      novNum ++;
    }else if (theMonth == 12) {
      decNum ++;
    }

    if (theCurrMembership.membership_type == 'gold' || theCurrMembership.membership_type == 'Gold') {
      gMemberships ++;
      if (theHours == 0) {
        g12a ++;
      }else if (theHours == 1) {
        g1a ++;
      }else if (theHours == 2) {
        g2a ++;
      }else if (theHours == 3) {
        g3a ++;
      }else if (theHours == 4) {
        g4a ++;
      }else if (theHours == 5) {
        g5a ++;
      }else if (theHours == 6) {
        g6a ++;
      }else if (theHours == 7) {
        g7a ++;
      }else if (theHours == 8) {
        g8a ++;
      }else if (theHours == 9) {
        g9a ++;
      }else if (theHours == 10) {
        g10a ++;
      }else if (theHours == 11) {
        g11a ++;
      }else if (theHours == 12) {
        g12p ++;
      }else if (theHours == 13) {
        g1p ++;
      }else if (theHours == 14) {
        g2p ++;
      }else if (theHours == 15) {
        g3p ++;
      }else if (theHours == 16) {
        g4p ++;
      }else if (theHours == 17) {
        g5p ++;
      }else if (theHours == 18) {
        g6p ++;
      }else if (theHours == 19) {
        g7p ++;
      }else if (theHours == 20) {
        g8p ++;
      }else if (theHours == 21) {
        g9p ++;
      }else if (theHours == 22) {
        g10p ++;
      }else if (theHours == 23) {
        g11p ++;
      }

      if (isToday) {
        if (theHours == 0) {
          g12at ++;
        }else if (theHours == 1) {
          g1at ++;
        }else if (theHours == 2) {
          g2at ++;
        }else if (theHours == 3) {
          g3at ++;
        }else if (theHours == 4) {
          g4at ++;
        }else if (theHours == 5) {
          g5at ++;
        }else if (theHours == 6) {
          g6at ++;
        }else if (theHours == 7) {
          g7at ++;
        }else if (theHours == 8) {
          g8at ++;
        }else if (theHours == 9) {
          g9at ++;
        }else if (theHours == 10) {
          g10at ++;
        }else if (theHours == 11) {
          g11at ++;
        }else if (theHours == 12) {
          g12pt ++;
        }else if (theHours == 13) {
          g1pt ++;
        }else if (theHours == 14) {
          g2pt ++;
        }else if (theHours == 15) {
          g3pt ++;
        }else if (theHours == 16) {
          g4pt ++;
        }else if (theHours == 17) {
          g5pt ++;
        }else if (theHours == 18) {
          g6pt ++;
        }else if (theHours == 19) {
          g7pt ++;
        }else if (theHours == 20) {
          g8pt ++;
        }else if (theHours == 21) {
          g9pt ++;
        }else if (theHours == 22) {
          g10pt ++;
        }else if (theHours == 23) {
          g11pt ++;
        }
      }

      if (isWeek) {
        if (theHours == 0) {
          g12aw ++;
        }else if (theHours == 1) {
          g1aw ++;
        }else if (theHours == 2) {
          g2aw ++;
        }else if (theHours == 3) {
          g3aw ++;
        }else if (theHours == 4) {
          g4aw ++;
        }else if (theHours == 5) {
          g5aw ++;
        }else if (theHours == 6) {
          g6aw ++;
        }else if (theHours == 7) {
          g7aw ++;
        }else if (theHours == 8) {
          g8aw ++;
        }else if (theHours == 9) {
          g9aw ++;
        }else if (theHours == 10) {
          g10aw ++;
        }else if (theHours == 11) {
          g11aw ++;
        }else if (theHours == 12) {
          g12pw ++;
        }else if (theHours == 13) {
          g1pw ++;
        }else if (theHours == 14) {
          g2pw ++;
        }else if (theHours == 15) {
          g3pw ++;
        }else if (theHours == 16) {
          g4pw ++;
        }else if (theHours == 17) {
          g5pw ++;
        }else if (theHours == 18) {
          g6pw ++;
        }else if (theHours == 19) {
          g7pw ++;
        }else if (theHours == 20) {
          g8pw ++;
        }else if (theHours == 21) {
          g9pw ++;
        }else if (theHours == 22) {
          g10pw ++;
        }else if (theHours == 23) {
          g11pw ++;
        }
      }

      if (isMonth) {
        if (theHours == 0) {
          g12am ++;
        }else if (theHours == 1) {
          g1am ++;
        }else if (theHours == 2) {
          g2am ++;
        }else if (theHours == 3) {
          g3am ++;
        }else if (theHours == 4) {
          g4am ++;
        }else if (theHours == 5) {
          g5am ++;
        }else if (theHours == 6) {
          g6am ++;
        }else if (theHours == 7) {
          g7am ++;
        }else if (theHours == 8) {
          g8am ++;
        }else if (theHours == 9) {
          g9am ++;
        }else if (theHours == 10) {
          g10am ++;
        }else if (theHours == 11) {
          g11am ++;
        }else if (theHours == 12) {
          g12pm ++;
        }else if (theHours == 13) {
          g1pm ++;
        }else if (theHours == 14) {
          g2pm ++;
        }else if (theHours == 15) {
          g3pm ++;
        }else if (theHours == 16) {
          g4pm ++;
        }else if (theHours == 17) {
          g5pm ++;
        }else if (theHours == 18) {
          g6pm ++;
        }else if (theHours == 19) {
          g7pm ++;
        }else if (theHours == 20) {
          g8pm ++;
        }else if (theHours == 21) {
          g9pm ++;
        }else if (theHours == 22) {
          g10pm ++;
        }else if (theHours == 23) {
          g11pm ++;
        }
      }

//    }else if (theCurrMembership.membership_type == 'one-day pass') {
    }else {
      odpMemberships ++;
      if (theHours == 0) {
        odp12a ++;
      }else if (theHours == 1) {
        odp1a ++;
      }else if (theHours == 2) {
        odp2a ++;
      }else if (theHours == 3) {
        odp3a ++;
      }else if (theHours == 4) {
        odp4a ++;
      }else if (theHours == 5) {
        odp5a ++;
      }else if (theHours == 6) {
        odp6a ++;
      }else if (theHours == 7) {
        odp7a ++;
      }else if (theHours == 8) {
        odp8a ++;
      }else if (theHours == 9) {
        odp9a ++;
      }else if (theHours == 10) {
        odp10a ++;
      }else if (theHours == 11) {
        odp11a ++;
      }else if (theHours == 12) {
        odp12p ++;
      }else if (theHours == 13) {
        odp1p ++;
      }else if (theHours == 14) {
        odp2p ++;
      }else if (theHours == 15) {
        odp3p ++;
      }else if (theHours == 16) {
        odp4p ++;
      }else if (theHours == 17) {
        odp5p ++;
      }else if (theHours == 18) {
        odp6p ++;
      }else if (theHours == 19) {
        odp7p ++;
      }else if (theHours == 20) {
        odp8p ++;
      }else if (theHours == 21) {
        odp9p ++;
      }else if (theHours == 22) {
        odp10p ++;
      }else if (theHours == 23) {
        odp11p ++;
      }

      if (isToday) {
        if (theHours == 0) {
          odp12at ++;
        }else if (theHours == 1) {
          odp1at ++;
        }else if (theHours == 2) {
          odp2at ++;
        }else if (theHours == 3) {
          odp3at ++;
        }else if (theHours == 4) {
          odp4at ++;
        }else if (theHours == 5) {
          odp5at ++;
        }else if (theHours == 6) {
          odp6at ++;
        }else if (theHours == 7) {
          odp7at ++;
        }else if (theHours == 8) {
          odp8at ++;
        }else if (theHours == 9) {
          odp9at ++;
        }else if (theHours == 10) {
          odp10at ++;
        }else if (theHours == 11) {
          odp11at ++;
        }else if (theHours == 12) {
          odp12pt ++;
        }else if (theHours == 13) {
          odp1pt ++;
        }else if (theHours == 14) {
          odp2pt ++;
        }else if (theHours == 15) {
          odp3pt ++;
        }else if (theHours == 16) {
          odp4pt ++;
        }else if (theHours == 17) {
          odp5pt ++;
        }else if (theHours == 18) {
          odp6pt ++;
        }else if (theHours == 19) {
          odp7pt ++;
        }else if (theHours == 20) {
          odp8pt ++;
        }else if (theHours == 21) {
          odp9pt ++;
        }else if (theHours == 22) {
          odp10pt ++;
        }else if (theHours == 23) {
          odp11pt ++;
        }
      }

      if (isWeek) {
        if (theHours == 0) {
          odp12aw ++;
        }else if (theHours == 1) {
          odp1aw ++;
        }else if (theHours == 2) {
          odp2aw ++;
        }else if (theHours == 3) {
          odp3aw ++;
        }else if (theHours == 4) {
          odp4aw ++;
        }else if (theHours == 5) {
          odp5aw ++;
        }else if (theHours == 6) {
          odp6aw ++;
        }else if (theHours == 7) {
          odp7aw ++;
        }else if (theHours == 8) {
          odp8aw ++;
        }else if (theHours == 9) {
          odp9aw ++;
        }else if (theHours == 10) {
          odp10aw ++;
        }else if (theHours == 11) {
          odp11aw ++;
        }else if (theHours == 12) {
          odp12pw ++;
        }else if (theHours == 13) {
          odp1pw ++;
        }else if (theHours == 14) {
          odp2pw ++;
        }else if (theHours == 15) {
          odp3pw ++;
        }else if (theHours == 16) {
          odp4pw ++;
        }else if (theHours == 17) {
          odp5pw ++;
        }else if (theHours == 18) {
          odp6pw ++;
        }else if (theHours == 19) {
          odp7pw ++;
        }else if (theHours == 20) {
          odp8pw ++;
        }else if (theHours == 21) {
          odp9pw ++;
        }else if (theHours == 22) {
          odp10pw ++;
        }else if (theHours == 23) {
          odp11pw ++;
        }
      }

      if (isMonth) {
        if (theHours == 0) {
          odp12am ++;
        }else if (theHours == 1) {
          odp1am ++;
        }else if (theHours == 2) {
          odp2am ++;
        }else if (theHours == 3) {
          odp3am ++;
        }else if (theHours == 4) {
          odp4am ++;
        }else if (theHours == 5) {
          odp5am ++;
        }else if (theHours == 6) {
          odp6am ++;
        }else if (theHours == 7) {
          odp7am ++;
        }else if (theHours == 8) {
          odp8am ++;
        }else if (theHours == 9) {
          odp9am ++;
        }else if (theHours == 10) {
          odp10am ++;
        }else if (theHours == 11) {
          odp11am ++;
        }else if (theHours == 12) {
          odp12pm ++;
        }else if (theHours == 13) {
          odp1pm ++;
        }else if (theHours == 14) {
          odp2pm ++;
        }else if (theHours == 15) {
          odp3pm ++;
        }else if (theHours == 16) {
          odp4pm ++;
        }else if (theHours == 17) {
          odp5pm ++;
        }else if (theHours == 18) {
          odp6pm ++;
        }else if (theHours == 19) {
          odp7pm ++;
        }else if (theHours == 20) {
          odp8pm ++;
        }else if (theHours == 21) {
          odp9pm ++;
        }else if (theHours == 22) {
          odp10pm ++;
        }else if (theHours == 23) {
          odp11pm ++;
        }
      }
    }
  });
  await arg[2].forEach((item, i) => {
    let theInv = 0
    if (item[1].inventory) {
      theInv = item[1].inventory
    }
    productSales.push(Array(item[0], 0, item[1].name))
    productNames.push(item[1].name)
    productInventory.push(theInv)
    productInventoryColor.push('#' + Math.floor(Math.random() * 16777215).toString(16))
    if (item[1].membership) {
      membershipTypes.push(item[1].name)
      membershipTypesColor.push('#' + Math.floor(Math.random() * 16777215).toString(16))
      let theTypeNumber = 0
      arg[0].forEach((mItem, mI) => {
        if (mItem[1].membership_type == item[1].name) {
          theTypeNumber = theTypeNumber + 1
        }
      })
      membershipTypesData.push(theTypeNumber)
    }
  })
  await arg[3].forEach((item, i) => {
    item[1].products.forEach((item2, i2) => {
      productSales.forEach((item3, i3) => {
        if (item2 == item3[0]) {
          item3[1] ++
        }
      })
    })
  })
  productSales.forEach((item, i) => {
    productSalesLbl.push(item[2])
    productSalesDta.push(item[1])
    productSalesColor.push('#' + Math.floor(Math.random() * 16777215).toString(16))
  })
  const myTimeout = setTimeout(function(){
    createCharts()
    analyticsTabs.style.display = '';
  }, 5000);
})

ipcRenderer.on('analytics-run-success', (event, arg) => {
})
