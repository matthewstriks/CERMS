document.addEventListener('DOMContentLoaded', function() {
    const calendar = document.getElementById('calendar');
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    // Function to render the calendar
    function renderCalendar(month, year) {
        // Get the first day of the month
        const firstDay = new Date(year, month).getDay();
        // Get the number of days in the month
        const daysInMonth = 32 - new Date(year, month, 32).getDate();
        
        // Month names
        const monthNames = ["January", "February", "March", "April", "May", "June", "July",
                            "August", "September", "October", "November", "December"];
        
        // Clear previous calendar content
        calendar.innerHTML = '';

        // Header with month and year
        const header = `
          <div class="d-flex justify-content-between align-items-center mb-3">
            <button id="prevMonth" class="btn btn-outline-primary">&lt;</button>
            <h4>${monthNames[month]} ${year}</h4>
            <button id="nextMonth" class="btn btn-outline-primary">&gt;</button>
          </div>`;
          
        calendar.innerHTML = header;

        // Days of the week header
        const daysOfWeek = `
          <div class="d-flex text-center">
            <div class="p-2 flex-fill">Sun</div>
            <div class="p-2 flex-fill">Mon</div>
            <div class="p-2 flex-fill">Tue</div>
            <div class="p-2 flex-fill">Wed</div>
            <div class="p-2 flex-fill">Thu</div>
            <div class="p-2 flex-fill">Fri</div>
            <div class="p-2 flex-fill">Sat</div>
          </div>`;
          
        calendar.innerHTML += daysOfWeek;

        // Calendar grid for days
        const daysGrid = document.createElement('div');
        daysGrid.classList.add('d-flex', 'flex-wrap');

        // Add empty cells before the first day of the month
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('p-2', 'border', 'day-cell', 'flex-fill');
            emptyCell.style.minHeight = '100px'; // Adjust height
            daysGrid.appendChild(emptyCell);
        }

        // Add day cells
        for (let i = 1; i <= daysInMonth; i++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('p-2', 'border', 'day-cell', 'flex-fill', 'text-center');
            dayCell.style.minHeight = '100px'; // Adjust height
            dayCell.style.minWidth = '150px'; // Adjust height
            dayCell.innerHTML = `<div>${i}</div>`;
            daysGrid.appendChild(dayCell);

            // Break after every 7th day to start a new week line
            if ((i + firstDay) % 7 === 0) {
                const weekRow = document.createElement('div');
                weekRow.classList.add('d-flex', 'w-100');
                weekRow.appendChild(daysGrid.cloneNode(true));
                calendar.appendChild(weekRow);
                daysGrid.innerHTML = ''; // Clear the row
            }
        }

        // Append remaining days
        if (daysGrid.childElementCount > 0) {
            const weekRow = document.createElement('div');
            weekRow.classList.add('d-flex', 'w-100');
            weekRow.appendChild(daysGrid);
            calendar.appendChild(weekRow);
        }

        // Navigation buttons functionality
        document.getElementById('prevMonth').addEventListener('click', function() {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar(currentMonth, currentYear);
        });

        document.getElementById('nextMonth').addEventListener('click', function() {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar(currentMonth, currentYear);
        });

        // Today button functionality
        document.getElementById('todayBtn').addEventListener('click', function() {
            const today = new Date();
            currentMonth = today.getMonth();
            currentYear = today.getFullYear();
            renderCalendar(currentMonth, currentYear);
        });
    }

    renderCalendar(currentMonth, currentYear);

    // Add event button functionality
    document.getElementById('addEventBtn').addEventListener('click', function() {
        const eventDate = prompt("Enter the date for the event (YYYY-MM-DD):");
        if (eventDate) {
            alert(`Event added for ${eventDate}!`);
        }
    });

    // View all events button functionality
    document.getElementById('viewAllEventsBtn').addEventListener('click', function() {
        alert('View All Events button clicked!');
    });
});
