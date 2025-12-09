import { createClient } from '@supabase/supabase-js'

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

console.log('🔍 Supabase env vars:', {
  url: supabaseUrl ? '✓ set' : '✗ missing',
  key: supabaseKey ? '✓ set' : '✗ missing',
})

if (!supabaseUrl || !supabaseKey) {
  const error = new Error(
    `Missing Supabase environment variables.\nURL: ${supabaseUrl ? '✓' : '✗'}\nKEY: ${supabaseKey ? '✓' : '✗'}`
  )
  console.error('❌ Supabase init failed:', error)
  throw error
}

let supabase
try {
  supabase = createClient(supabaseUrl, supabaseKey)
  console.log('✅ Supabase client initialized successfully')
} catch (err) {
  console.error('❌ Failed to create Supabase client:', err)
  throw err
}

export { supabase }

// Types for our database
export interface LeaderboardEntry {
  id?: number;
  name: string;
  score: number;
  dappies: number;
  created_at?: string;
}

// API functions
export const leaderboardAPI = {
  // Get top 10 scores
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('score', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
    
    console.log('🗃️ Fresh leaderboard query result:', data);
    return data || [];
  },

  // Save a new score (update if user exists and score is better)
  async saveScore(name: string, score: number, dappies: number): Promise<boolean> {
    try {
      const trimmedName = name.trim();
      
      // Validate inputs to prevent exploitation
      if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 20) {
        console.error('Invalid name provided');
        return false;
      }
      
      if (score < 0 || score > 100000) {
        console.error('Invalid score range');
        return false;
      }
      
      if (dappies < 0 || dappies > 10000) {
        console.error('Invalid dappies count');
        return false;
      }

      console.log(`💾 Attempting to save score for ${trimmedName}: ${score} points, ${dappies} dappies`);
      
      // Check if user already exists
      console.log('🔍 Checking if user exists...');
      const { data: existingUsers, error: fetchError } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('name', trimmedName)
        .maybeSingle();
      
      if (fetchError) {
        console.error('Error checking existing user:', fetchError);
        return false;
      }
      
      if (existingUsers) {
        console.log('👤 User exists:', existingUsers);
        console.log('⚖️ Comparing scores - New:', score, 'vs Existing:', existingUsers.score);
        
        // User exists - only update if new score is better (higher)
        if (score > existingUsers.score) {
          console.log('🎯 New score is better! Updating...');
          
          // Simple update now that RLS is disabled
          const updateData = {
            score: score,
            dappies: dappies,
            created_at: new Date().toISOString()
          };
          
          const { data: updateResult, error: updateError } = await supabase
            .from('leaderboard')
            .update(updateData)
            .eq('id', existingUsers.id)
            .select();
          
          if (updateError) {
            console.error('❌ Error updating score:', updateError);
            return false;
          }
          
          console.log('✅ Score updated successfully!');
          console.log('📊 Update result data:', updateResult);
          return updateResult && updateResult.length > 0;
        } else {
          // Score is not better, don't save
          console.log(`⏸️ Score ${score} is not better than existing score ${existingUsers.score} for ${trimmedName}`);
          return true; // Return true since this is not an error condition
        }
      } else {
        console.log('🆕 User does not exist, creating new record...');
        // User doesn't exist - insert new record
        const { error: insertError } = await supabase
          .from('leaderboard')
          .insert([
            {
              name: trimmedName,
              score: score,
              dappies: dappies
            }
          ]);

        if (insertError) {
          console.error('Error inserting new score:', insertError);
          return false;
        }
        
        console.log('✅ New score saved successfully!');
        return true;
      }
    } catch (error) {
      console.error('Unexpected error in saveScore:', error);
      return false;
    }
  },

  // Get a user's best score
  async getUserBestScore(name: string): Promise<number | null> {
    try {
      const trimmedName = name.trim();
      
      const { data, error } = await supabase
        .from('leaderboard')
        .select('score')
        .eq('name', trimmedName)
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user best score:', error);
        return null;
      }
      
      return data?.score || null;
    } catch (error) {
      console.error('Unexpected error in getUserBestScore:', error);
      return null;
    }
  },

  // Clean up duplicate entries for a user, keeping only the highest score
  async cleanupDuplicates(name: string): Promise<void> {
    try {
      console.log('🧹 Cleaning up duplicates for user:', name);
      
      // Get all entries for this user, ordered by score (highest first)
      const { data: userEntries, error: fetchError } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('name', name.trim())
        .order('score', { ascending: false });
      
      if (fetchError || !userEntries || userEntries.length <= 1) {
        console.log('✅ No duplicates to clean up');
        return;
      }
      
      // Keep the first (highest score) entry, delete the rest
      const entriesToDelete = userEntries.slice(1);
      const idsToDelete = entriesToDelete.map(entry => entry.id);
      
      console.log(`🗑️ Deleting ${entriesToDelete.length} duplicate entries...`);
      
      for (const id of idsToDelete) {
        const { error: deleteError } = await supabase
          .from('leaderboard')
          .delete()
          .eq('id', id);
        
        if (deleteError) {
          console.warn(`⚠️ Could not delete duplicate entry ${id}:`, deleteError);
        }
      }
      
      console.log('✅ Duplicate cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  },

  // Subscribe to real-time leaderboard changes
  subscribeToLeaderboard(callback: (data: LeaderboardEntry[]) => void) {
    console.log('🔔 Setting up real-time subscription...');
    
    const subscription = supabase
      .channel('leaderboard_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leaderboard'
        },
        async (payload) => {
          console.log('🔄 Real-time update received:', payload);
          // Fetch fresh data when anything changes
          const freshData = await leaderboardAPI.getLeaderboard();
          callback(freshData);
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    return subscription;
  },

  // Unsubscribe from real-time updates
  unsubscribe(subscription: any) {
    console.log('🔇 Unsubscribing from real-time updates...');
    supabase.removeChannel(subscription);
  }
};