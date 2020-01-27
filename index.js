// Load environment variables
require('dotenv').config()

// Initialize Graphene
const Graphene = require('graphene-ai')
const graphene = new Graphene(process.env.GRAPHENE_API_KEY)

// Initialize Twitter API
const Twitter = require('twitter')
const twitterClient = new Twitter({
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
})

// Collect tweets from trends
let trends = []
let maxTrends = 5
let maxTweets = 20

const updateTrendsWaitTime = 1000 * 60 * 15

async function getTrends() {
    let requestId = Math.floor(Math.random() * 10000)
    try {
        let tempTrends = []
        // Get top trends
        let data = await twitterClient.get('trends/place', {
            id: process.env.TWITTER_WOEID,
        })

        // Get top 5 trends
        let topTrends = data[0].trends
            .sort((b, a) => a.tweet_volume - b.tweet_volume)
            .slice(0, maxTrends)

        // Create stream for each trend
        for (let trend of topTrends) {
            console.log(new Date(), `Getting tweets of trend "${trend.name}"`)
            let tweets = await getTweets(trend)
            console.log(new Date(), `Analyzing tweets of trend "${trend.name}"`)
            for (let tweet of tweets) {
                // Analyze each tweet under one session
                let analysis = await analyze(requestId, trend, tweet)
                tweet.analysis = analysis
            }
            // Save trend and analyzed tweets
            tempTrends.push({
                trend,
                tweets,
            })
        }

        trends = tempTrends
        console.log(new Date(), "Done collecting")

    } catch (e) {
        console.warn(e)
    }

    // Wait 5 minutes before getting more tweets
    setInterval(getTrends, updateTrendsWaitTime)
}

function getTweets(trend) {
    return new Promise((resolve, reject) => {
        let tweets = []
        let stream = twitterClient.stream('statuses/filter', {
            track: trend.name,
        })

        // Collect only 20 tweets
        stream.on('data', async event => {
            if (event) {
                // Dont get retweets
                if (event.text.startsWith("RT")) return

                // Dont get replies
                if (event.text.match(/\@/gmi)) return

                // Dont get links
                if (event.text.match(/https/gmi)) return


                // Collect tweets
                tweets.unshift({
                    text: event.text,
                    date: event.created_at,
                })

                // Collect only a certain number of tweets
                if (tweets.length == maxTweets) {
                    stream.destroy()
                    resolve(tweets)
                }
            }
        })

        stream.on('error', (error) => {
            stream.destroy()
            reject(error)
        })
    })
}

// No fail Graphene analysis
async function analyze(requestId, trend, tweet) {
    try {
        let analysis = await graphene.analyze(`${requestId}-${trend.name}`, tweet.text)
        return analysis
    } catch (e) {
        console.warn(e)
        // Try again
        return await analyze(requestId, trend, tweet)
    }
}

// Start trend-getting loop
getTrends()

// Start Express server to serve data collected
const express = require('express')
const app = express()
const port = 5000

app.get('/', (req, res) => res.json(trends))

app.listen(port, () => console.log(new Date(), `Demo is running on ${port}!`))