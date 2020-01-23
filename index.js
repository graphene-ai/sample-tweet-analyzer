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

async function getTrends() {
    try {
        let tempTrends = []
        // Get top trends
        let data = await twitterClient.get('trends/place', {
            id: process.env.TWITTER_WOEID,
        })

        // Get top 5 trends
        let topTrends = data[0].trends
            .sort((b, a) => a.tweet_volume - b.tweet_volume)
            .slice(0, 5)

        // Create stream for each trend
        for (let trend of topTrends) {
            console.log(`Getting tweets of trend "${trend.name}"`)
            let tweets = await getTweets(trend)
            for (let tweet of tweets) {
                // Analyze each tweet under one session
                let analysis = await analyze(trend, tweet)
                tweet.analysis = analysis
                console.log(tweet)
            }
            // Save trend and analyzed tweets
            tempTrends.push({
                trend,
                tweets,
            })
        }

        trends = tempTrends
        console.log("Done collecting")
    } catch (e) {
        console.warn(e)
        // Try again if it fails
        setTimeout(getTrends, 1000)
    }
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
                tweets.push({
                    text: event.text,
                    date: event.created_at,
                })
                if (tweets.length == maxTweets) {
                    stream.destroy()
                    resolve(tweets)
                }
                console.log(`Got tweet (${tweets.length} of ${maxTweets})`)
            }
        })

        stream.on('error', console.warn)
    })
}

// No fail Graphene analysis
async function analyze(trend, tweet) {
    try {
        let analysis = await graphene.analyze(trend.name, tweet.text)
        return analysis
    } catch (e) {
        console.warn(e)
        // Try again
        return await analyze(trend, tweet)
    }
}

// Get trends on start
getTrends()

// Get new trends every hour
setInterval(getTrends, 1000 * 60 * 60)

// Start Express server to serve data collected
const express = require('express')
const app = express()
const port = 5000

app.get('/', (req, res) => res.json(trends))

app.listen(port, () => console.log(`Demo is running on ${port}!`))