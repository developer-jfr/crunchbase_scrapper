const fs = require('fs')
const puppeteer = require('puppeteer');

async function login() {
	const browser = await puppeteer.launch({
		headless: false,
		slowMo: 10
	});

	const loginPage = await browser.newPage()

	await loginPage.goto('https://www.crunchbase.com/login')
	await loginPage.waitForSelector('login')
	await loginPage.type('input[name=email]', '', { delay: 20 })
	await loginPage.type('input[name=password]', '', { delay: 20 })
	await loginPage.keyboard.press(String.fromCharCode(13))
	await loginPage.waitForTimeout(2000)
	await loginPage.close()
	return browser
}

async function getPage(term, browser) {
	try {
		const page = await browser.newPage();
		const page2 = await browser.newPage();
		page.on('console', consoleObj => console.log(consoleObj.text()));
		page2.on('console', consoleObj => console.log(consoleObj.text()));

		await page.goto(term);
		await page2.goto(term + '/recent_investments')
		await page.waitForSelector('.multiple-sections')
		await page2.waitForSelector('body')

		// Summary page
		const curData = await page.evaluate(() => {
			function camelize(str) {
				return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
					return index === 0 ? word.toLowerCase() : word.toUpperCase();
				}).replace(/\s+/g, '');
			}

			const dataCompany = {
				summary: {
					about: {},
					highlights: {},
					details: {}
				},
				investments: {
					highlights: {}
				}
			}

			//About
			const container1 = document.querySelectorAll('.one-of-many-section')[0]
			const description = container1.querySelector('profile-section mat-card .description').innerText
			const infoList = container1.querySelectorAll('ul li')
			const cdk = document.querySelector('#cdk-describedby-message-container')

			infoList.forEach(elem => {
				try {
					let label = elem.querySelector('field-formatter').innerText
					const altClass = elem.querySelector('theme-icon').getAttribute('aria-describedby')
					const altLabel = cdk.querySelector(`#${altClass}`).innerHTML
					dataCompany.summary.about[camelize(altLabel)] = label
				} catch (e) {
					console.log(e);
				}
			})

			dataCompany.summary.about.description = description

			// highlights
			const container2 = document.querySelectorAll('.one-of-many-section')[1]
			const content = container2.querySelectorAll('profile-section mat-card anchored-values .spacer')

			content.forEach((elem) => {
				let label = elem.querySelector('.info label-with-info').innerText
				const value = elem.querySelector('.info field-formatter').innerText
				label = camelize(label)

				dataCompany.summary.highlights[label] = value
			})

			// Details
			const mainContent = document.querySelector('.main-content')
			const expDescription = document.querySelectorAll('description-card > div')[1]
			const textValueContent = mainContent.querySelectorAll('ul.text_and_value li')

			textValueContent.forEach(elem => {
				let label = elem.querySelector('.wrappable-label-with-info').innerText
				const value = elem.querySelector('field-formatter').innerText

				label = camelize(label)

				dataCompany.summary.details[label] = value
			})
			try {
				expDescription.classList.add('expanded');
				dataCompany.summary.details.description = expDescription.innerText
			} catch (e) {

			}
			return dataCompany
		})
		await page.close()
		const currentURL = await page2.url()
		console.log(currentURL);
		if (!currentURL.includes('recent_investments')) {
			//await browser.close()
			return curData
		}
		// Investment Page
		const links = await page2.evaluate(() => {
			try {
				const links = []
				const moreBtn = document.querySelectorAll('list-card-more-results')
				moreBtn.forEach(elem => {
					const link = elem.querySelector('a.mat-button').getAttribute('href')
					links.push('https://www.crunchbase.com' + link)
				})

				return links
			} catch (e) {

			}
		})

		let result = await page2.evaluate((curData) => {
			function camelize(str) {
				return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
					return index === 0 ? word.toLowerCase() : word.toUpperCase();
				}).replace(/\s+/g, '');
			}

			const rows = document.querySelectorAll('row-card')
			const items = document.querySelectorAll('anchored-values a')

			items.forEach(item => {
				const label = item.querySelector('label-with-info').innerText
				const value = item.querySelector('field-formatter').innerText
				curData.investments.highlights[camelize(label)] = value
			})

			rows.forEach(row => {
				const tableRows = row.querySelectorAll('tbody tr')
				const blockTitle = camelize(row.querySelector('.section-title').innerText)

				const moreBtn = row.querySelector('list-card-more-results')

				if (moreBtn == null || moreBtn == undefined) {
					const tableHead = row.querySelectorAll('thead th')
					const headers = []

					tableHead.forEach(elem => {
						const label = camelize(elem.querySelector('label-with-info').innerText)
						headers.push(label)
					})

					tableRows.forEach(elem => {
						const cells = elem.querySelectorAll('td')
						const obj = {}
						cells.forEach((cell, i) => {
							obj[headers[i]] = cell.innerText
						})
						if (curData.investments[blockTitle]) curData.investments[blockTitle].push(obj)
						else {
							curData.investments[blockTitle] = [obj]
						}
					})
				}
			})

			return curData
		}, (curData))
		page2.close()

		// Expanded informations
		try {
			for (let i = 0; i < links.length; i++) {
				const link = links[i]
				const expPage = await browser.newPage()
				await expPage.goto(link)
				await expPage.waitForSelector('body')
				result = await expPage.evaluate((result) => {
					function camelize(str) {
						return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
							return index === 0 ? word.toLowerCase() : word.toUpperCase();
						}).replace(/\s+/g, '');
					}
					const blockTitle = camelize(document.querySelector('.section-title').innerText)
					const tableRows = document.querySelectorAll('tbody tr')
					const tableHead = document.querySelectorAll('thead th')
					const headers = []

					tableHead.forEach(elem => {
						const label = camelize(elem.querySelector('label-with-info').innerText)
						headers.push(label)
					})

					tableRows.forEach(elem => {
						const cells = elem.querySelectorAll('td')
						const obj = {}
						cells.forEach((cell, i) => {
							obj[headers[i]] = cell.innerText
						})
						if (result.investments[blockTitle]) result.investments[blockTitle].push(obj)
						else {
							result.investments[blockTitle] = [obj]
						}
					})

					return result
				}, (result))
				await expPage.close()
			}
		} catch (e) {

		}

		//await browser.close()
		return result
	} catch (e) {
		console.log(e);
		return getPage(term)
		
	}
}

const start = async () => {
	const data = JSON.parse(await fs.readFileSync('data.json'))

	// const curData = await getPage(data[5].crunchbaseURL)
	// console.log(curData)
	// fs.writeFileSync('test.json', JSON.stringify(curData))
	const browser = await login()
	for (let i = 240; i < data.length; i++) {
		console.log(i);
		console.log(data[i].crunchbaseURL);
		if (data[i].crunchbaseURL !== undefined) {
			const curData = await getPage(data[i].crunchbaseURL, browser)
			curData.website = data[i].website
			curData.crunchbaseURL = data[i].crunchbaseURL
			curData.id = data[i].id
			const temp = JSON.parse(await fs.readFileSync('all_data.json'))
			temp.push(curData)
			fs.writeFileSync('all_data.json', JSON.stringify(temp))
		} else {
			const temp = JSON.parse(await fs.readFileSync('all_data.json'))
			temp.push(data[i])
			fs.writeFileSync('all_data.json', JSON.stringify(temp))
		}
	}
}

// const obj = []
// fs.writeFileSync('all_data.json', JSON.stringify(obj))

start();

